const test = require("node:test");
const assert = require("node:assert");
const { handler } = require("./index.js");

test("handler debe exportarse como una funcion", () => {
    assert.strictEqual(typeof handler, "function");
});

test("retornar batchItemFailures vacío si el evento no tiene records", async () => {
    const event = { Records: [] };
    const result = await handler(event);
    assert.deepStrictEqual(result, { batchItemFailures: [] });
});

test("reportar falla si el body del SQS no es un JSON", async () => {
    const event = {
        Records: [
            { messageId: "msg-error-json", body: "esto-no-es-un-json" }
        ]
    };
    const result = await handler(event);
    
    assert.strictEqual(result.batchItemFailures.length, 1);
    assert.strictEqual(result.batchItemFailures[0].itemIdentifier, "msg-error-json");
});

test("ignorar el evento s3:TestEvent sin reportar fallos", async () => {
    const event = {
        Records: [
            {
                messageId: "msg-test-event",
                body: JSON.stringify({ Event: "s3:TestEvent" })
            }
        ]
    };
    const result = await handler(event);
    assert.strictEqual(result.batchItemFailures.length, 0);
});

test("ignorar archivos que no esten en uploads/ sin reportar fallos", async () => {
    const event = {
        Records: [
            {
                messageId: "msg-wrong-folder",
                body: JSON.stringify({
                    Records: [{
                        s3: {
                            bucket: { name: "test-bucket" },
                            object: { key: "otra-carpeta/imagen.png" }
                        }
                    }]
                })
            }
        ]
    };
    //al ignorar la ruta, pasa sin errores
    const result = await handler(event);
    assert.strictEqual(result.batchItemFailures.length, 0);
});