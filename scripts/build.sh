#!/bin/bash
#scripts/build.sh

set -e #Detener si hay error

echo "Preparando directorio build/..."
mkdir -p build
rm -f build/*.zip

echo "Empaquetando upload-lambda..."
cd src/upload-lambda
npm ci --only=production
zip -rq ../../build/upload-lambda.zip . -x "*.test.js" "*tests*"
cd ../..

echo "Empaquetando crop-lambda..."
cd src/crop-lambda
npm ci --only=production
#Instalación para AWS Lambda para librería sharp
npm install --os=linux --cpu=x64 sharp
zip -rq ../../build/crop-lambda.zip . -x "*.test.js" "*tests*"
cd ../..

echo "Build completado. Artefactos generados en build/"