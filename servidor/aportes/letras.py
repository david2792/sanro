"""Importe en letras para los recibos (guaraníes, sin decimales)."""

_UNIDADES = ["", "un", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez", "once", "doce",
             "trece", "catorce", "quince", "dieciséis", "diecisiete", "dieciocho", "diecinueve", "veinte",
             "veintiún", "veintidós", "veintitrés", "veinticuatro", "veinticinco", "veintiséis", "veintisiete",
             "veintiocho", "veintinueve"]
_DECENAS = ["", "", "", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"]
_CENTENAS = ["", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos", "seiscientos",
             "setecientos", "ochocientos", "novecientos"]


def _menor_mil(n):
    if n == 100:
        return "cien"
    c, resto = divmod(n, 100)
    partes = [_CENTENAS[c]] if c else []
    if resto < 30:
        partes.append(_UNIDADES[resto])
    else:
        d, u = divmod(resto, 10)
        partes.append(_DECENAS[d] + (f" y {_UNIDADES[u]}" if u else ""))
    return " ".join(p for p in partes if p)


def numero_a_letras(n):
    """1250000 -> 'un millón doscientos cincuenta mil'."""
    n = int(n)
    if n == 0:
        return "cero"
    if n < 0:
        return "menos " + numero_a_letras(-n)
    millones, resto = divmod(n, 1_000_000)
    miles, unidades = divmod(resto, 1000)
    partes = []
    if millones:
        partes.append("un millón" if millones == 1 else f"{numero_a_letras(millones)} millones")
    if miles:
        partes.append("mil" if miles == 1 else f"{_menor_mil(miles)} mil")
    if unidades:
        partes.append(_menor_mil(unidades))
    return " ".join(partes)


def importe_en_letras(n):
    texto = numero_a_letras(n)
    # "un" delante de "guaraníes" (veintiún guaraníes, un millón de guaraníes)
    de = " de" if texto.endswith(("millón", "millones")) else ""
    return f"{texto}{de} guaraníes".capitalize()
