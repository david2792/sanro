from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from rest_framework import serializers

from .models import Alumno, AlumnoTutor, Docente, DocumentoAlumno, Tutor, Usuario


class UsuarioSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False)
    docente_id = serializers.SerializerMethodField()

    class Meta:
        model = Usuario
        fields = ["id", "username", "first_name", "last_name", "email", "rol", "ci",
                  "telefono", "is_active", "is_superuser", "password", "docente_id"]
        read_only_fields = ["is_superuser"]

    def get_docente_id(self, obj):
        return getattr(getattr(obj, "docente", None), "id", None)

    def create(self, data):
        password = data.pop("password", None)
        user = Usuario(**data)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save()
        return user

    def update(self, user, data):
        password = data.pop("password", None)
        for k, v in data.items():
            setattr(user, k, v)
        if password:
            user.set_password(password)
        user.save()
        return user


class AlumnoTutorSerializer(serializers.ModelSerializer):
    tutor_nombre = serializers.CharField(source="tutor.__str__", read_only=True)
    tutor_telefono = serializers.CharField(source="tutor.telefono", read_only=True)

    class Meta:
        model = AlumnoTutor
        fields = ["id", "alumno", "tutor", "tutor_nombre", "tutor_telefono", "parentesco", "es_principal"]


class DocumentoAlumnoSerializer(serializers.ModelSerializer):
    class Meta:
        model = DocumentoAlumno
        fields = ["id", "alumno", "tipo", "archivo", "subido"]


class AlumnoSerializer(serializers.ModelSerializer):
    tutores = AlumnoTutorSerializer(source="alumnotutor_set", many=True, read_only=True)
    documentos = DocumentoAlumnoSerializer(many=True, read_only=True)
    seccion_actual = serializers.SerializerMethodField()

    class Meta:
        model = Alumno
        fields = "__all__"

    def get_seccion_actual(self, obj):
        m = obj.matriculas.filter(estado__in=["ACTIVA", "PENDIENTE_DOC"], anio_lectivo__activo=True).select_related("seccion").first()
        return {"matricula_id": m.id, "seccion_id": m.seccion_id, "seccion": str(m.seccion)} if m else None


class TutorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tutor
        exclude = ["alumnos"]


class DocenteSerializer(serializers.ModelSerializer):
    """
    Al crear o editar un docente se le puede dar acceso a la plataforma en el mismo paso:
    {..., username, password}. Se crea (o actualiza) su usuario con rol Docente y queda vinculado.
    Si se manda la contraseña sin usuario, el usuario es su C.I.
    """

    username = serializers.CharField(write_only=True, required=False, allow_blank=True, allow_null=True, max_length=150)
    password = serializers.CharField(write_only=True, required=False, allow_blank=True, allow_null=True,
                                     style={"input_type": "password"})

    class Meta:
        model = Docente
        fields = "__all__"

    def to_representation(self, obj):
        data = super().to_representation(obj)
        data["username"] = obj.usuario.username if obj.usuario else None
        return data

    def validate(self, data):
        actual = getattr(self.instance, "usuario", None)
        username = (data.get("username") or "").strip()
        password = data.get("password") or ""
        if not username and password and actual is None:
            username = (data.get("ci") or getattr(self.instance, "ci", "")).strip()
        if username:
            otros = Usuario.objects.filter(username__iexact=username)
            if actual:
                otros = otros.exclude(pk=actual.pk)
            if otros.exists():
                raise serializers.ValidationError({"username": f"El usuario «{username}» ya existe. Elegí otro."})
            if actual is None and not password:
                raise serializers.ValidationError({"password": "Para crear el acceso, indicá una contraseña."})
        if password:
            prueba = actual or Usuario(username=username, first_name=data.get("nombres", ""), last_name=data.get("apellidos", ""))
            try:
                validate_password(password, prueba)
            except DjangoValidationError as e:
                raise serializers.ValidationError({"password": e.messages})
        data["username"], data["password"] = username, password
        return data

    @transaction.atomic
    def create(self, data):
        username, password = data.pop("username", ""), data.pop("password", "")
        docente = super().create(data)
        self._dar_acceso(docente, username, password)
        return docente

    @transaction.atomic
    def update(self, docente, data):
        username, password = data.pop("username", ""), data.pop("password", "")
        docente = super().update(docente, data)
        self._dar_acceso(docente, username, password)
        return docente

    def _dar_acceso(self, docente, username, password):
        u = docente.usuario
        if u is None and not username:
            return  # sin acceso a la plataforma
        if u is None:
            u = Usuario(username=username, rol=Usuario.Rol.DOCENTE)
        elif username:
            u.username = username
        u.first_name, u.last_name = docente.nombres, docente.apellidos
        u.ci, u.telefono = docente.ci, docente.telefono
        u.email = docente.email or u.email
        if u.rol == Usuario.Rol.DOCENTE:
            # Un docente dado de baja no puede entrar. (No se toca a directivos que además dan clases.)
            u.is_active = docente.activo
        if password:
            u.set_password(password)
        u.save()
        if docente.usuario_id != u.id:
            docente.usuario = u
            docente.save(update_fields=["usuario"])
