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

### Rama `feature/integracion-inicial` (Piero Aguirre)

Commits realizados:

- **`.gitignore` inicial:** excluye `.terraform/`, `*.tfstate`, `*.tfstate.backup` y archivos locales de Terraform.
- **Bucket del state** (`tfstate-backend/`): bucket S3 `image-processor-tfstate-<ACCOUNT_ID>` con versionado, cifrado AES-256, bloqueo de acceso público y `force_destroy`; se aplica una sola vez con state local y expone `tfstate_bucket` y `account_id`.
- **Versiones fijas** (`version.tf`): Terraform y provider `hashicorp/aws` `6.67.0` exactos, sin rangos `~>`.
- **Provider** (`providers.tf`): región `us-east-1` configurable y etiquetas por defecto `Project`, `Environment` y `ManagedBy` en todos los recursos.
- **Backend remoto** (`backend.tf`): backend S3 parcial (`backend "s3" {}`) para inyectar un state distinto por entorno con `-backend-config`.
- **`.terraform.lock.hcl`:** versionado para que todo el equipo use los mismos providers.

  
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

### Rama `feature/crop-worker` (Joaquín Portella)

Commits realizados:

- **Handler de procesamiento** (`src/crop-lambda/`): `package.json` con `sharp` y `@aws-sdk/client-s3`; lee los mensajes SQS que contienen la notificación de S3 y descarga la imagen de `uploads/`.
- **Recorte circular:** con `sharp` redimensiona a 40x40 (`fit: cover`), aplica una máscara SVG circular y genera PNG con canal alfa.
- **Guardado en S3:** sube el resultado a `processed/{nombre}_circular.png` con `ContentType: image/png`.
- **Fallos parciales:** devuelve `batchItemFailures` para que SQS reintente solo los mensajes que fallaron (y los envíe a la DLQ tras 3 intentos).
- **Pruebas unitarias:** 5 pruebas con `node --test` y S3 simulado; verifican que la salida sea 40x40, con transparencia en las esquinas y opaca en el centro.
- **Empaquetado** (`scripts/build.sh`): genera `build/upload-lambda.zip` y `build/crop-lambda.zip` con dependencias para Linux x64 (binarios de `sharp` para Lambda).
- **Módulo `crop_worker`** (`modules/crop_worker/`):
  - Rol IAM con confianza `lambda.amazonaws.com`, `AWSLambdaBasicExecutionRole` y política inline con `s3:GetObject` en `uploads/*`, `s3:PutObject` en `processed/*` y `sqs:ReceiveMessage`/`DeleteMessage`/`GetQueueAttributes` sobre la cola.
  - Log group `/aws/lambda/...-crop` con retención configurable.
  - Lambda (`nodejs20.x`, `index.handler`) con variable `S3_BUCKET`.
  - Event Source Mapping desde SQS con lote de 5 y `ReportBatchItemFailures`.
- **README:** sección "Cómo probar".

### Rama `feature/infra-base` (Piero Aguirre)

Commits realizados:

- **Variables raíz** (`variables.tf`): `project = "image-processor"`, `env` validado (`dev`, `qa`, `prod`), `aws_region`, `log_retention_days = 14` y rutas de los zip de las Lambdas.
- **Módulo `storage`** (`modules/storage/`): bucket `image-processor-{env}-images-{sufijo}` con `random_id`, cifrado AES-256, versionado, bloqueo de acceso público, `force_destroy` y ciclo de vida (`uploads/` 30 días, `processed/` 90 días, versiones antiguas 1 día); outputs `bucket_name` y `bucket_arn`.
- **Módulo `queue`** (`modules/queue/`):
  - Cola principal (visibilidad 360 s = 6 × timeout de crop, retención 1 día, long polling 20 s) y DLQ (14 días) con `maxReceiveCount = 3`.
  - Política de la cola que permite `sqs:SendMessage` solo a `s3.amazonaws.com` desde el bucket del proyecto (`aws:SourceArn`).
  - Notificación S3 → SQS en `s3:ObjectCreated:*` filtrada por `uploads/`.
  - Alarma de CloudWatch cuando la DLQ tiene mensajes (sin SNS).
- **Entornos** (`envs/`): `dev`, `qa` y `prod`, cada uno con `.tfvars` y `.backend.hcl` (state separado `image-processor/{env}/terraform.tfstate`, cifrado y `use_lockfile`).
- **Raíz** (`main.tf`, `outputs.tf`): conecta storage → queue → upload_api → crop_worker; outputs `api_url`, `upload_url`, `bucket_name`, `queue_url` y `crop_function_name`.
- **Correcciones de integración:**
  - `crop_worker`: 512 MB y 60 s, permiso `sqs:ChangeMessageVisibility`, variable `PROCESSED_PREFIX`, output `function_name` y `terraform fmt`.
  - `build.sh`: instala en carpeta limpia con `npm install --os=linux --cpu=x64` (sin depender de `package-lock.json`) y crea el zip también desde Git Bash en Windows.
  - Terraform fijado en `1.14.8` en la raíz, los módulos y `tfstate-backend`.
- **Despliegue y destrucción:** `apply` en dev, qa y prod (28 recursos por entorno), prueba con `curl` y PNG circular en `processed/`; luego `destroy` de los 3 entornos y del bucket del state.

  

#### Validación de Terraform
- [x] `terraform fmt -check -recursive`
- [x] `terraform init -backend=false` en `modules/upload_api`
- [x] `terraform validate` en `modules/upload_api`
- [x] `node --test` en `src/upload-lambda` (9/9)

## Despliegue

### Requisitos

- Terraform `1.14.8`
- AWS CLI con credenciales configuradas (`aws configure`)
- Node.js 20 o superior y npm
- Git Bash (Windows), WSL o Linux

Todos los comandos se ejecutan desde la raíz del repositorio.

### 1. Verificar la cuenta

```bash
aws sts get-caller-identity
```

### 2. Crear el bucket del state (una sola vez)

```bash
cd tfstate-backend
terraform init
terraform apply
cd ..
```

Copia el `account_id` del output y reemplázalo en `envs/dev.backend.hcl`, `envs/qa.backend.hcl` y `envs/prod.backend.hcl`:

```hcl
bucket = "image-processor-tfstate-<ACCOUNT_ID>"
```

> El state de `tfstate-backend/` es local. No borres `tfstate-backend/terraform.tfstate`: se necesita para destruir el bucket al final.

### 3. Empaquetar las Lambdas

```bash
bash scripts/build.sh
```

Genera `build/upload-lambda.zip` y `build/crop-lambda.zip`.

### 4. Desplegar cada entorno

**DEV**
```bash
terraform init -reconfigure -backend-config=envs/dev.backend.hcl
terraform apply -var-file=envs/dev.tfvars
```

**QA**
```bash
terraform init -reconfigure -backend-config=envs/qa.backend.hcl
terraform apply -var-file=envs/qa.tfvars
```

**PROD**
```bash
terraform init -reconfigure -backend-config=envs/prod.backend.hcl
terraform apply -var-file=envs/prod.tfvars
```

Antes de escribir `yes`, verifica que el plan muestre `0 to destroy` y que los nombres de los recursos incluyan el entorno (`-dev-`, `-qa-` o `-prod-`).

### 5. Probar

```bash
terraform output
curl -X POST "$(terraform output -raw upload_url)" -F "file=@imagen.jpg;type=image/jpeg"
```

Espera unos segundos y revisa el bucket:

```bash
aws s3 ls s3://$(terraform output -raw bucket_name) --recursive
```

Debe aparecer la imagen original en `uploads/` y el PNG circular de 40x40 en `processed/`.

> `terraform output` muestra el entorno del último `terraform init`.

### 6. Destruir

Primero los entornos, en orden PROD → QA → DEV:

```bash
for e in prod qa dev; do
  terraform init -reconfigure -backend-config=envs/$e.backend.hcl &&
  terraform destroy -var-file=envs/$e.tfvars || break
done
```

Al final, el bucket del state:

```bash
cd tfstate-backend
terraform destroy
cd ..
aws s3 ls | grep image-processor
```

El último comando no debe mostrar resultados.
