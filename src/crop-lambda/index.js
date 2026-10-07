const { S3Client, GetObjectCommand, PutObjectCommand } = require("@aws-sdk/client-s3");
const sharp = require("sharp");

const s3 = new S3Client();

exports.handler = async (event) => {
    const batchItemFailures = [];
    const destinationBucket = process.env.S3_BUCKET;

    for (const record of event.Records) {
        try {
            const body = JSON.parse(record.body);
            
            //Ignorar eventos de prueba de S3
            if (body.Event === "s3:TestEvent") continue;
            
            //Iterar sobre registros de S3 contenidos en mensaje SQS
            if (!body.Records) continue;

            for (const s3Record of body.Records) {
                const sourceBucket = s3Record.s3.bucket.name;
                const key = decodeURIComponent(s3Record.s3.object.key.replace(/\+/g, " "));

                //Validar que venga de la carpeta uploads/
                if (!key.startsWith("uploads/")) continue;

                //1.Descargar imagen original
                const getCmd = new GetObjectCommand({ Bucket: sourceBucket, Key: key });
                const { Body } = await s3.send(getCmd);
                const imageBuffer = await Body.transformToByteArray();

                //2.Recorte circular 40x40 transparente con sharp
                const circleSvg = `<svg><circle cx="20" cy="20" r="20" /></svg>`;
                const processedBuffer = await sharp(imageBuffer)
                    .resize(40, 40)
                    .composite([{
                        input: Buffer.from(circleSvg),
                        blend: 'dest-in'
                    }])
                    .png()
                    .toBuffer();

                //3.Generar nuevo nombre y subir a S3 en processed/
                const fileNameWithExt = key.split('/').pop();
                const fileName = fileNameWithExt.substring(0, fileNameWithExt.lastIndexOf('.')) || fileNameWithExt;
                const processedKey = `processed/${fileName}_circular.png`;

                const putCmd = new PutObjectCommand({
                    Bucket: destinationBucket || sourceBucket, //Usar la variable de entorno
                    Key: processedKey,
                    Body: processedBuffer,
                    ContentType: "image/png"
                });
                await s3.send(putCmd);
                
                console.log(`Imagen procesada y guardada en: ${processedKey}`);
            }
        } catch (error) {
            console.error(`Error procesando mensaje ${record.messageId}:`, error);
            //Reportar fallo para este mensaje específico
            batchItemFailures.push({ itemIdentifier: record.messageId });
        }
    }

    //Retornar los fallos segun ReportBatchItemFailures
    return { batchItemFailures };
};