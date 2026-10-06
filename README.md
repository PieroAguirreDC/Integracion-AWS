# Integracion-AWS

Estudiantes:
- Aguirre Del Castillo, Piero Gadiel
- Montero Manosalva, Fabrizio Sebastián
- 

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

### 2. Rama `feature/upload-api` (Fabrizio Montero)

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

## Validación de Terraform

- [x] `terraform fmt -check -recursive`
- [x] `terraform init -backend=false` en `modules/upload_api`
- [x] `terraform validate` en `modules/upload_api`
- [x] `node --test` en `src/upload-lambda` (9/9)