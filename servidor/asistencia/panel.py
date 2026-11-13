"""
Panel de decisiones: alerta temprana y seguimiento por rol (director, profe guía, docente).

Todo se calcula sobre el año lectivo activo, en memoria, con pocas consultas.
"""
from collections import defaultdict
from datetime import date, timedelta

from django.db.models import Count, Q

from academico.models import AnioLectivo, Asignacion, DiaNoLectivo, Institucion, Matricula, Seccion
from pedagogico.models import Instrumento, Puntaje, RegistroAnecdotico, RegistroClase
from personas.models import AlumnoTutor, Docente
from .models import PermisoDocente, RegistroAsistencia, SesionClase

PRESENTE = {"P", "T", "R"}  # el retiro anticipado estuvo en clase


def _pct(a, b):
    return round(a * 100 / b, 1) if b else None


class Datos:
    """Carga una sola vez todo lo necesario del año activo."""

    def __init__(self, hoy=None, institucion=None):
        self.hoy = hoy or date.today()
        self.institucion = institucion or Institucion()
        self.anio = AnioLectivo.actual(self.institucion)
        self.min_asistencia = self.institucion.asistencia_minima
        self.min_logro = self.institucion.logro_minimo
        if not self.anio:
            return

        self.matriculas = {
            m.id: m for m in Matricula.objects.filter(anio_lectivo=self.anio, estado=Matricula.Estado.ACTIVA)
            .select_related("alumno", "seccion__curso")
        }
        self.secciones = {s.id: s for s in Seccion.objects.filter(anio_lectivo=self.anio).select_related("curso", "docente_guia")}
        self.asignaciones = {
            a.id: a for a in Asignacion.objects.filter(seccion__anio_lectivo=self.anio).select_related("materia", "docente", "seccion")
        }

        # Asistencia: un registro por alumno y clase.
        self.registros = [
            (mat, "J" if est == "A" and just else est, fecha, asig)  # "J": ausencia con justificativo aprobado
            for mat, est, just, fecha, asig in RegistroAsistencia.objects.filter(
                sesion__asignacion__seccion__anio_lectivo=self.anio)
            .values_list("matricula_id", "estado", "justificada", "sesion__fecha", "sesion__asignacion_id")
        ]

        # Trabajos: solo cuentan los que ya tienen al menos un puntaje cargado.
        self.instrumentos = {
            i.id: i for i in Instrumento.objects.filter(asignacion__seccion__anio_lectivo=self.anio)
            .annotate(cargados=Count("puntajes", filter=Q(puntajes__puntaje__isnull=False)))
        }
        self.puntajes = defaultdict(dict)  # instrumento -> {matricula: puntaje}
        for inst_id, mat_id, p in Puntaje.objects.filter(instrumento__in=self.instrumentos.keys()).values_list(
                "instrumento_id", "matricula_id", "puntaje"):
            self.puntajes[inst_id][mat_id] = p

        hace30 = self.hoy - timedelta(days=30)
        self.negativos = defaultdict(int)
        for mat_id in RegistroAnecdotico.objects.filter(
                tipo=RegistroAnecdotico.Tipo.NEGATIVO, fecha__gte=hace30, asignacion__seccion__anio_lectivo=self.anio
        ).values_list("alumnos", flat=True):
            self.negativos[mat_id] += 1

        self._preparar()

    def _preparar(self):
        hace30 = self.hoy - timedelta(days=30)
        por_mat = defaultdict(lambda: {"total": 0, "pres": 0, "aus": 0, "just": 0, "tarde30": 0, "dias": defaultdict(set)})
        self.por_mat_asig = defaultdict(lambda: {"total": 0, "pres": 0, "aus30": 0})
        for mat, est, fecha, asig in self.registros:
            d = por_mat[mat]
            d["total"] += 1
            d["pres"] += est in PRESENTE
            d["aus"] += est == "A"
            d["just"] += est == "J"
            if est == "T" and fecha >= hace30:
                d["tarde30"] += 1
            d["dias"][fecha].add(est)
            x = self.por_mat_asig[(mat, asig)]
            x["total"] += 1
            x["pres"] += est in PRESENTE
            if est == "A" and fecha >= hace30:
                x["aus30"] += 1
        self.asis = por_mat

        # Logro por matrícula (global y por asignación) sobre trabajos ya corregidos.
        self.logro = defaultdict(lambda: {"obt": 0.0, "tot": 0.0, "sin_entregar": 0})
        self.logro_asig = defaultdict(lambda: {"obt": 0.0, "tot": 0.0, "sin_entregar": 0})
        for inst in self.instrumentos.values():
            if not inst.cargados:
                continue
            asig = self.asignaciones.get(inst.asignacion_id)
            if not asig:
                continue
            total = float(inst.puntaje_total)
            notas = self.puntajes.get(inst.id, {})
            for m in self.matriculas.values():
                if m.seccion_id != asig.seccion_id:
                    continue
                p = notas.get(m.id)
                for dest in (self.logro[m.id], self.logro_asig[(m.id, asig.id)]):
                    dest["tot"] += total
                    if p is None:
                        dest["sin_entregar"] += 1
                    else:
                        dest["obt"] += float(p)

        # Unidades evaluadas por indicadores: cada indicador vale 1 punto (L = 1, NL = 0).
        from pedagogico.models import Indicador, LogroIndicador
        ind_unidad = {}  # indicador -> (unidad, asignacion)
        for i_id, u_id, a_id in Indicador.objects.filter(
                capacidad__unidad__asignacion__seccion__anio_lectivo=self.anio
        ).values_list("id", "capacidad__unidad_id", "capacidad__unidad__asignacion_id"):
            ind_unidad[i_id] = (u_id, a_id)
        n_por_unidad = defaultdict(int)
        for u_id, a_id in ind_unidad.values():
            n_por_unidad[(u_id, a_id)] += 1
        logrados = defaultdict(int)
        evaluadas = set()
        for ind_id, mat_id, estado in LogroIndicador.objects.filter(indicador_id__in=ind_unidad).values_list(
                "indicador_id", "matricula_id", "estado"):
            u_id, a_id = ind_unidad[ind_id]
            evaluadas.add((u_id, a_id))
            if estado == "L":
                logrados[(mat_id, u_id)] += 1
        for (u_id, a_id) in evaluadas:
            asig = self.asignaciones.get(a_id)
            if not asig:
                continue
            for m in self.matriculas.values():
                if m.seccion_id != asig.seccion_id:
                    continue
                for dest in (self.logro[m.id], self.logro_asig[(m.id, a_id)]):
                    dest["tot"] += n_por_unidad[(u_id, a_id)]
                    dest["obt"] += logrados.get((m.id, u_id), 0)

    # ------------------------------------------------------------------ riesgo

    def dias_seguidos_ausente(self, mat_id):
        """Días de clase consecutivos (los más recientes) en que faltó a todas sus clases sin justificar."""
        dias = self.asis[mat_id]["dias"] if mat_id in self.asis else {}
        n = 0
        for f in sorted(dias, reverse=True):
            if dias[f] == {"A"}:
                n += 1
            else:
                break
        return n

    def riesgo(self, m):
        a = self.asis.get(m.id)
        motivos, puntos = [], 0
        pct = _pct(a["pres"], a["total"]) if a else None
        if a and a["total"] >= 5 and pct < self.min_asistencia:
            motivos.append(f"Asistencia {pct}% (mínimo {self.min_asistencia}%)")
            puntos += 2
        seguidos = self.dias_seguidos_ausente(m.id)
        if seguidos >= 2:
            motivos.append(f"{seguidos} días seguidos sin venir")
            puntos += 2 if seguidos >= 3 else 1
        lg = self.logro.get(m.id)
        logro = _pct(lg["obt"], lg["tot"]) if lg and lg["tot"] else None
        if logro is not None and logro < self.min_logro:
            motivos.append(f"Logro {logro}% en trabajos (mínimo {self.min_logro}%)")
            puntos += 2
        if lg and lg["sin_entregar"] >= 2:
            motivos.append(f"{lg['sin_entregar']} trabajos sin entregar")
            puntos += 1
        if a and a["tarde30"] >= 5:
            motivos.append(f"{a['tarde30']} llegadas tardías en 30 días")
            puntos += 1
        neg = self.negativos.get(m.id, 0)
        if neg >= 2:
            motivos.append(f"{neg} registros anecdóticos negativos en 30 días")
            puntos += 1
        nivel = "ALTO" if puntos >= 4 else "MEDIO" if puntos >= 2 else "BAJO" if puntos else None
        return {
            "matricula": m.id, "alumno_id": m.alumno_id, "alumno": str(m.alumno),
            "seccion_id": m.seccion_id, "seccion": _nombre_corto(m.seccion),
            "nivel": nivel, "puntos": puntos, "motivos": motivos,
            "asistencia": pct, "logro": logro, "dias_seguidos": seguidos,
        }

    def alertas(self, filtro=lambda m: True):
        filas = [self.riesgo(m) for m in self.matriculas.values() if filtro(m)]
        filas = [f for f in filas if f["nivel"]]
        return sorted(filas, key=lambda f: (-f["puntos"], f["asistencia"] if f["asistencia"] is not None else 101))

    # ----------------------------------------------------------- agregados

    def tendencia(self, dias=30, seccion_id=None):
        desde = self.hoy - timedelta(days=dias)
        por_dia = defaultdict(lambda: [0, 0])
        for mat, est, fecha, asig in self.registros:
            if fecha < desde or fecha > self.hoy:
                continue
            if seccion_id and self.asignaciones[asig].seccion_id != seccion_id:
                continue
            por_dia[fecha][0] += est in PRESENTE
            por_dia[fecha][1] += 1
        return [{"fecha": f.isoformat(), "porcentaje": _pct(p, t), "registros": t} for f, (p, t) in sorted(por_dia.items())]

    def asistencia_hoy(self, seccion_id=None):
        p = t = 0
        for mat, est, fecha, asig in self.registros:
            if fecha == self.hoy and (not seccion_id or self.asignaciones[asig].seccion_id == seccion_id):
                p += est in PRESENTE
                t += 1
        return {"presentes": p, "registros": t, "porcentaje": _pct(p, t)}


def _nombre_corto(s):
    """'1° A · Mañana' en vez del nombre largo con especialidad y año."""
    esp = s.curso.especialidad_id and s.curso.especialidad.nombre.split(" con ")[0].replace("Bachillerato ", "B. ")
    base = f"{s.curso.nombre} {s.letra} · {s.get_turno_display()}"
    return f"{base} · {esp}" if esp else base


# ====================================================================== vistas

def vista_colegio(d: Datos):
    hoy = d.hoy
    alertas = d.alertas()

    # Por sección
    secciones = []
    for s in d.secciones.values():
        mats = [m for m in d.matriculas.values() if m.seccion_id == s.id]
        p = t = 0
        bajo = 0
        for m in mats:
            a = d.asis.get(m.id)
            if a:
                p += a["pres"]
                t += a["total"]
                if a["total"] >= 5 and _pct(a["pres"], a["total"]) < d.min_asistencia:
                    bajo += 1
        ob = tot = 0.0
        for m in mats:
            lg = d.logro.get(m.id)
            if lg:
                ob += lg["obt"]
                tot += lg["tot"]
        riesgo = [a for a in alertas if a["seccion_id"] == s.id]
        secciones.append({
            "id": s.id, "nombre": _nombre_corto(s), "alumnos": len(mats),
            "asistencia": _pct(p, t), "bajo_minimo": bajo, "logro": _pct(ob, tot),
            "riesgo_alto": sum(1 for a in riesgo if a["nivel"] == "ALTO"),
            "riesgo_medio": sum(1 for a in riesgo if a["nivel"] == "MEDIO"),
            "guia": str(s.docente_guia) if s.docente_guia else None,
        })
    secciones.sort(key=lambda x: (x["asistencia"] is None, x["asistencia"] or 0))

    # Seguimiento docente
    hace14, hace30 = hoy - timedelta(days=14), hoy - timedelta(days=30)
    sesiones = list(SesionClase.objects.filter(asignacion__seccion__anio_lectivo=d.anio)
                    .values_list("id", "docente_id", "fecha"))
    con_registro = set(RegistroClase.objects.filter(sesion__asignacion__seccion__anio_lectivo=d.anio)
                       .values_list("sesion_id", flat=True))
    permisos_hoy = set(PermisoDocente.objects.filter(docente__institucion_id=d.anio.institucion_id, fecha_desde__lte=hoy, fecha_hasta__gte=hoy).values_list("docente_id", flat=True))
    docentes_ids = {a.docente_id for a in d.asignaciones.values()}
    no_lectivos = set(DiaNoLectivo.objects.filter(anio_lectivo=d.anio).values_list("fecha", flat=True))
    permisos = list(PermisoDocente.objects.filter(docente__institucion_id=d.anio.institucion_id, fecha_hasta__gte=hace14, fecha_desde__lte=hoy)
                    .values_list("docente_id", "fecha_desde", "fecha_hasta"))
    hechas = {(a_id, f) for a_id, f in SesionClase.objects.filter(
        asignacion__seccion__anio_lectivo=d.anio, fecha__gte=hace14).values_list("asignacion_id", "fecha")}
    dias_14 = [hoy - timedelta(days=k) for k in range(1, 15)
               if (hoy - timedelta(days=k)) >= d.anio.fecha_inicio and (hoy - timedelta(days=k)) not in no_lectivos]

    def sin_lista_14(doc_id):
        """Clases que le tocaban (según sus días de clase) en los últimos 14 días y no tienen lista."""
        n = 0
        for a in d.asignaciones.values():
            if a.docente_id != doc_id or not a.dias_clase:
                continue
            for f in dias_14:
                if a.tiene_clase(f) and (a.id, f) not in hechas and not any(
                        p[0] == doc_id and p[1] <= f <= p[2] for p in permisos):
                    n += 1
        return n

    docentes = []
    for doc in Docente.objects.filter(id__in=docentes_ids, activo=True):
        suyas = [x for x in sesiones if x[1] == doc.id]
        ultima = max((x[2] for x in suyas), default=None)
        recientes = [x for x in suyas if x[2] >= hace30]
        inst_incompletos = sum(
            1 for i in d.instrumentos.values()
            if d.asignaciones.get(i.asignacion_id) and d.asignaciones[i.asignacion_id].docente_id == doc.id
            and i.cargados < sum(1 for m in d.matriculas.values() if m.seccion_id == d.asignaciones[i.asignacion_id].seccion_id)
        )
        docentes.append({
            "id": doc.id, "docente": str(doc),
            "ultima_lista": ultima.isoformat() if ultima else None,
            "dias_sin_lista": (hoy - ultima).days if ultima else None,
            "listas_14_dias": sum(1 for x in suyas if x[2] >= hace14),
            "desarrollo_registrado": _pct(sum(1 for x in recientes if x[0] in con_registro), len(recientes)),
            "trabajos_incompletos": inst_incompletos,
            "con_permiso": doc.id in permisos_hoy,
            "con_horario": any(a.dias_clase for a in d.asignaciones.values() if a.docente_id == doc.id),
            "sin_lista_14": sin_lista_14(doc.id),
        })
    docentes.sort(key=lambda x: (-x["sin_lista_14"], -(x["dias_sin_lista"] if x["dias_sin_lista"] is not None else 999)))

    clases_hoy = SesionClase.objects.filter(fecha=hoy, asignacion__seccion__anio_lectivo=d.anio).count()
    con_lista_hoy = {a_id for a_id, f in hechas if f == hoy}
    programadas = [a for a in d.asignaciones.values() if a.dias_clase and a.tiene_clase(hoy)] if hoy not in no_lectivos else []
    pendientes_hoy = [
        {"asignacion": a.id, "materia": a.materia.nombre, "seccion": _nombre_corto(a.seccion), "docente": str(a.docente)}
        for a in sorted(programadas, key=lambda a: (str(a.docente), a.materia.nombre))
        if a.id not in con_lista_hoy and a.docente_id not in permisos_hoy
    ]
    return {
        "hoy": {**d.asistencia_hoy(), "clases_registradas": clases_hoy, "asignaciones": len(d.asignaciones),
                "docentes_con_permiso": len(permisos_hoy), "feriado": hoy in no_lectivos,
                "clases_programadas": len(programadas), "pendientes": pendientes_hoy,
                "con_horario": sum(1 for a in d.asignaciones.values() if a.dias_clase)},
        "totales": {
            "alumnos": len(d.matriculas),
            "riesgo_alto": sum(1 for a in alertas if a["nivel"] == "ALTO"),
            "riesgo_medio": sum(1 for a in alertas if a["nivel"] == "MEDIO"),
            "negativos_30": sum(d.negativos.values()),
        },
        "tendencia": d.tendencia(30),
        "secciones": secciones,
        "alertas": alertas[:60],
        "docentes": docentes,
    }


def vista_guia(d: Datos, docente):
    salida = []
    for s in d.secciones.values():
        if s.docente_guia_id != docente.id:
            continue
        mats = {m.id: m for m in d.matriculas.values() if m.seccion_id == s.id}
        # Ausentes hoy (faltaron a todas sus clases registradas hoy) con contacto del tutor.
        ausentes = []
        for mid, m in mats.items():
            estados = d.asis[mid]["dias"].get(d.hoy) if mid in d.asis else None
            if estados and estados <= {"A", "J"} and "A" in estados:
                ausentes.append(m)
        contactos = {}
        for at in AlumnoTutor.objects.filter(alumno_id__in=[m.alumno_id for m in ausentes]).select_related("tutor").order_by("-es_principal"):
            contactos.setdefault(at.alumno_id, {"nombre": str(at.tutor), "telefono": at.tutor.telefono, "parentesco": at.parentesco})
        # Logro por materia
        materias = []
        for a in d.asignaciones.values():
            if a.seccion_id != s.id:
                continue
            ob = tot = 0.0
            p = t = 0
            for mid in mats:
                lg = d.logro_asig.get((mid, a.id))
                if lg:
                    ob += lg["obt"]
                    tot += lg["tot"]
                x = d.por_mat_asig.get((mid, a.id))
                if x:
                    p += x["pres"]
                    t += x["total"]
            materias.append({"asignacion": a.id, "materia": a.materia.nombre, "docente": str(a.docente),
                             "logro": _pct(ob, tot), "asistencia": _pct(p, t)})
        materias.sort(key=lambda x: (x["logro"] is None, x["logro"] or 0))
        anec = RegistroAnecdotico.objects.filter(asignacion__seccion=s).select_related("asignacion__materia").prefetch_related("alumnos__alumno")[:6]
        salida.append({
            "seccion_id": s.id, "seccion": _nombre_corto(s), "alumnos": len(mats),
            "hoy": d.asistencia_hoy(s.id),
            "ausentes_hoy": [{"matricula": m.id, "alumno_id": m.alumno_id, "alumno": str(m.alumno),
                              "dias_seguidos": d.dias_seguidos_ausente(m.id), "tutor": contactos.get(m.alumno_id)}
                             for m in sorted(ausentes, key=lambda m: str(m.alumno))],
            "alertas": d.alertas(lambda m: m.seccion_id == s.id),
            "materias": materias,
            "tendencia": d.tendencia(30, s.id),
            "anecdoticos": [{"id": r.id, "fecha": r.fecha.isoformat(), "tipo": r.tipo, "materia": r.asignacion.materia.nombre,
                             "alumnos": [str(m.alumno) for m in r.alumnos.all()], "hecho": r.hecho} for r in anec],
        })
    return salida


def vista_docente(d: Datos, docente):
    hace30 = d.hoy - timedelta(days=30)
    sesiones = list(SesionClase.objects.filter(asignacion__docente=docente, asignacion__seccion__anio_lectivo=d.anio)
                    .values_list("id", "asignacion_id", "fecha"))
    con_registro = set(RegistroClase.objects.filter(sesion__asignacion__docente=docente).values_list("sesion_id", flat=True))
    salida = []
    for a in d.asignaciones.values():
        if a.docente_id != docente.id:
            continue
        mats = [m for m in d.matriculas.values() if m.seccion_id == a.seccion_id]
        suyas = [x for x in sesiones if x[1] == a.id]
        ultima = max((x[2] for x in suyas), default=None)
        p = t = 0
        ob = tot = 0.0
        en_riesgo = []
        for m in mats:
            x = d.por_mat_asig.get((m.id, a.id))
            lg = d.logro_asig.get((m.id, a.id))
            if x:
                p += x["pres"]
                t += x["total"]
            if lg:
                ob += lg["obt"]
                tot += lg["tot"]
            motivos = []
            if x and x["aus30"] >= 3:
                motivos.append(f"{x['aus30']} ausencias en 30 días")
            lgp = _pct(lg["obt"], lg["tot"]) if lg and lg["tot"] else None
            if lgp is not None and lgp < d.min_logro:
                motivos.append(f"Logro {lgp}%")
            if lg and lg["sin_entregar"] >= 2:
                motivos.append(f"{lg['sin_entregar']} sin entregar")
            if motivos:
                en_riesgo.append({"matricula": m.id, "alumno": str(m.alumno), "motivos": motivos})
        incompletos = [{"id": i.id, "titulo": i.titulo, "cargados": i.cargados, "alumnos": len(mats)}
                       for i in d.instrumentos.values() if i.asignacion_id == a.id and i.cargados < len(mats)]
        salida.append({
            "asignacion": a.id, "materia": a.materia.nombre, "seccion": _nombre_corto(a.seccion),
            "alumnos": len(mats), "asistencia": _pct(p, t), "logro": _pct(ob, tot),
            "ultima_lista": ultima.isoformat() if ultima else None,
            "lista_hoy": any(x[2] == d.hoy for x in suyas),
            "clase_hoy": a.tiene_clase(d.hoy),
            "dias_clase": a.dias_clase,
            "sin_desarrollo": sum(1 for x in suyas if x[2] >= hace30 and x[0] not in con_registro),
            "trabajos_incompletos": incompletos,
            "en_riesgo": en_riesgo,
        })
    salida.sort(key=lambda x: (not x["clase_hoy"], x["lista_hoy"], x["seccion"]))
    return salida


def panel(usuario, hoy=None, institucion=None):
    d = Datos(hoy, institucion)
    resp = {"fecha": d.hoy.isoformat(), "anio": d.anio.anio if d.anio else None,
            "minimos": {"asistencia": d.min_asistencia, "logro": d.min_logro}}
    if not d.anio:
        return resp
    docente = getattr(usuario, "docente", None)
    if usuario.es_gestion:
        resp["colegio"] = vista_colegio(d)
    if docente:
        resp["guia"] = vista_guia(d, docente)
        resp["docente"] = vista_docente(d, docente)
    return resp
