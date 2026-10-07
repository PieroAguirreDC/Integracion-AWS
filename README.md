# Integracion-AWS

Estudiantes:
- Aguirre Del Castillo, Piero Gadiel
- Montero Manosalva, Fabrizio Sebastián
- Portella Pedemonte, Joaquín Antonio

## Aplicación de Conventional Commits

Formato: `<tipo>(<ámbito>): <descripción en imperativo>`

Tipos: `feat`, `fix`, `docs`, `chore`, `test`.

Ámbitos: `terraform`, `componente aws`, `env`, `anotacion`.

## Ramas:

| Rama | Uso |
|---|---|
| `main` | Lo desplegado en PROD |
| `develop` | Integración, se despliega en DEV y QA |
| `feature/<tema>` | Una tarea, sale de `develop` |
| `fix/<tema>` | Corrección, sale de `develop` 
## Resumen del proyecto Realizado
### Rama `feature/upload-api` (Fabrizio Montero)

Commits realizados:

- **Handler de subida** (`src/upload-lambda/`): `package.json` CommonJS con Node ≥20 y dependencias fijas (`@aws-sdk/client-s3@3.899.0`, `busboy@1.6.0`), sin librería `uuid` (usa `crypto.randomUUID()`).
- **Parseo de peticiones:** acepta `multipart/form-data` (busboy) y JSON con imagen en base64.
- **Validación** solo por content-type (jpg, jpeg, png, gif, webp) → `400`; límite de 6 MB → `413`.
- **Guardado en S3:** sube el original a `uploads/{uuid}.{ext}` con el ContentType correcto y responde `201` con `{ id, key, processedKey }` (`processedKey = processed/{uuid}_circular.png`); errores de S3 → `500` con mensaje genérico.
- **Pruebas unitarias** (`index.test.js`): 9 pruebas con `node --test` y cliente S3 simulado (sin AWS real) — multipart, JSON base64, tipos inválidos, parseo inválido, tamaño y extensión `.jpeg`.
- **Módulo `upload_api`** (`modules/upload_api/`):
  - Rol IAM con confianza `lambda.amazonaws.com`, política gestionada `AWSLambdaBasicExecutionRole` y política inline única con `s3:PutObject` solo sobre `uploads/*`.
  - Log groups de la Lambda y de la API con retención configurable.
  - Lambda (`nodejs20.x`, 256 MB, 30 s, `index.handler`) con variables `S3_BUCKET` y `UPLOAD_PREFIX`.
  - HTTP API v2 con CORS, integración `AWS_PROXY` (payload 2.0), ruta `POST /upload`, stage `$default` con throttling y access logs en JSON, permiso de invocación y output `api_url`.
- **`.gitignore`:** ignora `build/` y `*.zip` (sin artefactos de build en el repo).

#### Validación de Terraform
- [x] `terraform fmt -check -recursive`
- [x] `terraform init -backend=false` en `modules/upload_api`
- [x] `terraform validate` en `modules/upload_api`
- [x] `node --test` en `src/upload-lambda` (9/9)

## Cómo probar (Joaquín Portella)

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