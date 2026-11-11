"""
Estado de cuenta de los aportes: qué cuotas corresponden a cada alumno, cuánto pagó,
qué está vencido y qué está exonerado. Todo se calcula con pocas consultas.
"""
from collections import defaultdict
from datetime import date

from academico.models import Matricula
from .models import ConceptoAporte, DetallePago, Exoneracion

MESES = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]

# Estado de una cuota
PAGADO, EXONERADO, VENCIDO, PARCIAL, POR_VENCER = "PAGADO", "EXONERADO", "VENCIDO", "PARCIAL", "POR_VENCER"
# Estado de un alumno (según lo vencido)
AL_DIA, CON_DEUDA, EXONERADO_TOTAL, SIN_CUOTAS = "AL_DIA", "CON_DEUDA", "EXONERADO", "SIN_CUOTAS"
# Avance de un alumno (según lo pagado del total del año)
COMPLETO, PAGO_PARCIAL, SIN_PAGOS = "COMPLETO", "PARCIAL", "SIN_PAGOS"


def pct(a, b):
    return round(a * 100 / b, 1) if b else None


def nombre_seccion(s):
    """'1° Curso A · Mañana' (sin el año, que ya se sabe)."""
    return f"{s.curso.nombre} {s.letra} · {s.get_turno_display()}"


class EstadoAportes:
    def __init__(self, anio, hoy=None):
        self.anio = anio
        self.hoy = hoy or date.today()
        self.conceptos = list(
            ConceptoAporte.objects.filter(anio_lectivo=anio, activo=True)
            .select_related("anio_lectivo").prefetch_related("cursos"))
        self.cursos = {c.id: {x.id for x in c.cursos.all()} for c in self.conceptos}
        self.pagado = defaultdict(int)  # (matricula, concepto, mes) -> Gs.
        for mat, con, mes, monto in DetallePago.objects.filter(
                pago__anio_lectivo=anio, pago__anulado=False
        ).values_list("pago__matricula_id", "concepto_id", "mes", "monto"):
            self.pagado[(mat, con, mes)] += monto
        self.exonerado = set(
            Exoneracion.objects.filter(concepto__anio_lectivo=anio).values_list("matricula_id", "concepto_id"))

    def matriculas(self, **filtros):
        return (Matricula.objects.filter(anio_lectivo=self.anio, estado=Matricula.Estado.ACTIVA, **filtros)
                .select_related("alumno", "seccion__curso")
                .order_by("seccion__curso__nivel__orden", "seccion__curso__grado", "seccion__letra",
                          "numero_lista", "alumno__apellidos", "alumno__nombres"))

    def aplica(self, concepto, m):
        cursos = self.cursos[concepto.id]
        return not cursos or m.seccion.curso_id in cursos

    def cuotas(self, m):
        """Todas las cuotas del alumno con su estado."""
        filas = []
        for c in self.conceptos:
            if not self.aplica(c, m):
                continue
            exon = (m.id, c.id) in self.exonerado
            for mes, vence in c.cuotas():
                # Quien se matriculó a mitad de año no debe los meses anteriores.
                if mes and m.fecha and m.fecha.year == self.anio.anio and mes < m.fecha.month:
                    continue
                pagado = self.pagado.get((m.id, c.id, mes), 0)
                vencida = vence <= self.hoy
                if exon:
                    estado = EXONERADO
                elif pagado >= c.monto:
                    estado = PAGADO
                elif pagado:
                    estado = PARCIAL  # pagó una parte; si ya venció, el resto es deuda
                elif vencida:
                    estado = VENCIDO
                else:
                    estado = POR_VENCER
                filas.append({
                    "concepto": c.id, "concepto_nombre": c.nombre, "mes": mes,
                    "etiqueta": MESES[mes] if mes else c.nombre, "vence": vence,
                    "monto": c.monto, "pagado": pagado, "estado": estado,
                    "exigible": c.monto if vencida and not exon else 0,
                    "deuda": c.monto - pagado if vencida and not exon and pagado < c.monto else 0,
                    # Lo que falta pagar, haya vencido o no.
                    "saldo": c.monto - pagado if not exon and pagado < c.monto else 0,
                })
        return filas

    def resumen(self, m, cuotas=None):
        cuotas = self.cuotas(m) if cuotas is None else cuotas
        exigible = sum(c["exigible"] for c in cuotas)
        deuda = sum(c["deuda"] for c in cuotas)
        if not cuotas:
            estado = SIN_CUOTAS
        elif all(c["estado"] == EXONERADO for c in cuotas):
            estado = EXONERADO_TOTAL
        elif deuda:
            estado = CON_DEUDA
        else:
            estado = AL_DIA
        pagado = sum(c["pagado"] for c in cuotas)
        saldo = sum(c["saldo"] for c in cuotas)
        if estado in (SIN_CUOTAS, EXONERADO_TOTAL):
            avance = estado
        else:
            avance = COMPLETO if not saldo else PAGO_PARCIAL if pagado else SIN_PAGOS
        return {
            "matricula": m.id, "alumno_id": m.alumno_id, "alumno": str(m.alumno), "ci": m.alumno.ci,
            "numero_lista": m.numero_lista, "seccion_id": m.seccion_id, "seccion": nombre_seccion(m.seccion),
            "estado": estado, "avance": avance, "exigible": exigible, "deuda": deuda,
            "pagado": pagado, "saldo": saldo,
            "porcentaje_pagado": pct(pagado, pagado + saldo),
            "cuotas_vencidas": sum(1 for c in cuotas if c["deuda"]),
        }

    def por_seccion(self, resumenes, secciones):
        """Totales por sección a partir de los resúmenes de alumnos."""
        grupos = defaultdict(list)
        for r in resumenes:
            grupos[r["seccion_id"]].append(r)
        filas = []
        for s in secciones:
            rs = grupos.get(s.id, [])
            exigible = sum(r["exigible"] for r in rs)
            deuda = sum(r["deuda"] for r in rs)
            pagado = sum(r["pagado"] for r in rs)
            saldo = sum(r["saldo"] for r in rs)
            filas.append({
                "id": s.id, "seccion": nombre_seccion(s), "alumnos": len(rs),
                "al_dia": sum(1 for r in rs if r["estado"] == AL_DIA),
                "con_deuda": sum(1 for r in rs if r["estado"] == CON_DEUDA),
                "exonerados": sum(1 for r in rs if r["estado"] == EXONERADO_TOTAL),
                "completos": sum(1 for r in rs if r["avance"] == COMPLETO),
                "parciales": sum(1 for r in rs if r["avance"] == PAGO_PARCIAL),
                "sin_pagos": sum(1 for r in rs if r["avance"] == SIN_PAGOS),
                "exigible": exigible, "deuda": deuda, "pagado": pagado, "saldo": saldo,
                # Qué parte del total del año ya se cobró.
                "porcentaje_pagado": pct(pagado, pagado + saldo),
                # Qué parte de lo vencido ya está cubierto.
                "cumplimiento": pct(exigible - deuda, exigible),
            })
        return filas
