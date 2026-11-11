from rest_framework.pagination import PageNumberPagination


class Paginacion(PageNumberPagination):
    page_size = 50
    page_size_query_param = "page_size"  # ?page_size=1000 para llenar selectores
    max_page_size = 2000
