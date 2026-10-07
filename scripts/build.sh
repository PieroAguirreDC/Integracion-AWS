#!/usr/bin/env bash
# scripts/build.sh
# Empaqueta las Lambdas en build/*.zip con dependencias para Linux x64.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD="$ROOT/build"

rm -rf "$BUILD"
mkdir -p "$BUILD/tmp"

zip_dir() { # $1 = carpeta a comprimir, $2 = zip de salida
  if command -v zip >/dev/null 2>&1; then
    (cd "$1" && zip -rq "$2" .)
  elif [ -x /c/Windows/System32/tar.exe ]; then
    # Git Bash en Windows: el tar de Windows (bsdtar) crea zip con -a
    (cd "$1" && /c/Windows/System32/tar.exe -a -cf "$(cygpath -w "$2")" *)
  elif command -v python3 >/dev/null 2>&1; then
    (cd "$1" && python3 -m zipfile -c "$2" ./*)
  else
    echo "ERROR: se necesita 'zip' o 'python3' para crear el zip" >&2
    exit 1
  fi
}

package() { # $1 = nombre de la lambda
  local name="$1" src="$ROOT/src/$1" tmp="$BUILD/tmp/$1"
  echo "Empaquetando $name..."
  mkdir -p "$tmp"
  cp "$src/index.js" "$src/package.json" "$tmp/"
  # Instala en una carpeta limpia, solo dependencias de producción y binarios de Linux x64
  (cd "$tmp" && npm install --omit=dev --no-audit --no-fund --os=linux --cpu=x64 --libc=glibc)
  rm -f "$tmp/package-lock.json"
  zip_dir "$tmp" "$BUILD/$name.zip"
}

package upload-lambda
package crop-lambda

rm -rf "$BUILD/tmp"
echo "Build completado:"
ls -lh "$BUILD"/*.zip