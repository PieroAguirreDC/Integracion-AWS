# Reemplazar <ACCOUNT_ID> por el id de la cuenta AWS (sale en el output de tfstate-backend/).
bucket       = "image-processor-tfstate-<ACCOUNT_ID>"
key          = "image-processor/dev/terraform.tfstate"
region       = "us-east-1"
encrypt      = true
use_lockfile = true
