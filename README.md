# Integracion-AWS

Estudiantes:
- Aguirre Del Castillo, Piero Gadiel
- 
- 


## Aplicación de Conventional Commits

Formato: `<tipo>(<ámbito>): <descripción en imperativo>`

Tipos: `feat`, `fix`, `docs`.

Ámbitos: `terraform`, `componente aws`, `env`, `anotacion`.

## Ramas:

| Rama | Uso |
|---|---|
| `main` | Lo desplegado en PROD |
| `develop` | Integración, se despliega en DEV y QA |
| `feature/<tema>` | Una tarea, sale de `develop` |
| `fix/<tema>` | Corrección, sale de `develop` 
## Resumen del proyecto Realizado
(Se redactará al final)

## Cómo probar

### 1. Construir los Zips de las Lambdas
Antes de desplegar con Terraform, debes empaquetar el code:
```bash
chmod +x scripts/build.sh
./scripts/build.sh
Esto genera los archivos `build/upload-lambda.zip` y `build/crop-lambda.zip`.

### 2. Flujo de subida (API gateway-upload lambda-S3)
Realiza un POST a la URL dada por API gateway tras el despliegue (`api_url`).

**Opción A: usando multipart/form-data**
```bash
curl -X POST <api_url>/upload \
  -F "image=@/ruta/a/tu/imagen.jpg"
```

**Opción B: usando JSON (Base64)**
```bash
curl -X POST <api_url>/upload \
  -H "Content-Type: application/json" \
  -d '{"image": "data:image/png;base64,iVBORw0K..."}'
```

**Respuesta exitosa esperada:**
```json
{
  "id": "uuid-generado",
  "key": "uploads/uuid-generado.jpg",
  "processedKey": "processed/uuid-generado_circular.png"
}
```

### 3. Validación del procesamiento completo
Si la subida fue exitosa:
1. El archivo original existirá en S3 con el prefijo `uploads/`.
2. S3 enviará automáticamente un evento a la cola SQS.
3. El worker procesará el mensaje en lotes y creará el recorte.
4. El archivo final lo encuentras en S3 bajo la ruta devuelta en `processedKey`.