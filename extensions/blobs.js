(function (Scratch) {
    let urls = []
    class Extension {
        getInfo() {
            return {
                id: "dmnBlobs",
                name: "Blobs",
                useUnsandboxedRuntime: true,
                color1: "#357500",
                color2: "#2a5e00",
                color3: "#91ff00",
                blocks: [
                    {
                        opcode: "newBlob",
                        blockType: Scratch.BlockType.REPORTER,
                        text: "new [TYPE] blob from [DATA] mime [MIME]",
                        arguments: {
                            TYPE: {type: Scratch.ArgumentType.STRING, menu: "types"},
                            DATA: {type: Scratch.ArgumentType.STRING, exemptFromNormalization: true},
                            MIME: {type: Scratch.ArgumentType.STRING, defaultValue: "text/plain"},
                        }
                    },
                    {
                        opcode: "getBlob",
                        blockType: Scratch.BlockType.REPORTER,
                        text: "[BLOB] as [METHOD]",
                        arguments: {
                            METHOD: {type: Scratch.ArgumentType.STRING, menu: "methods"},
                        }
                    },
                    {
                        opcode: "sliceBlob",
                        blockType: Scratch.BlockType.REPORTER,
                        text: "slice [BLOB] from bytes [START] to [END] with mime [MIME]",
                        arguments: {
                            START: {type: Scratch.ArgumentType.NUMBER},
                            END: {type: Scratch.ArgumentType.NUMBER},
                            MIME: {type: Scratch.ArgumentType.STRING, defaultValue: "text/plain"},
                        }
                    },
                    "---",
                    {
                        opcode: "createUrl",
                        blockType: Scratch.BlockType.REPORTER,
                        text: "create url from blob [BLOB]",
                        arguments: {}
                    },
                    {
                        opcode: "revokeUrl",
                        blockType: Scratch.BlockType.COMMAND,
                        text: "revoke blob url [blobURL]",
                        arguments: {
                            blobURL: {type: Scratch.ArgumentType.STRING},
                        }
                    },
                    {
                        opcode: "revokeAll",
                        blockType: Scratch.BlockType.COMMAND,
                        text: "revoke all blob urls",
                        arguments: {}
                    },
                ],
                menus: {
                    types: {
                        acceptReporters: false,
                        items: ["text", "url", "base64"]
                    },
                    methods: {
                        acceptReporters: false,
                        items: ["text", "bytes", "base64"]
                    }
                }
            }
        }

        async newBlob({TYPE, DATA, MIME}) {
            try {
                if (Array.isArray(DATA)) {
                    return new Blob(DATA, {type: MIME})
                }
                let part
                switch (TYPE) {
                    case "base64":
                        if (typeof DATA === 'string')
                            part = atob(DATA);
                    break;
                    case "url":
                        if (typeof DATA === 'string')
                            return await fetch(DATA)
                            .then(response => response.blob());
                    case "text":
                        part = Scratch.Cast.toString(DATA)
                        break;
                }
                if (part) {
                    return new Blob([part], {type: MIME})
                }
            } catch(e) {
                console.error(e)
            }
        }

        async getBlob({BLOB, METHOD}) {
            if (BLOB instanceof Blob) {
                switch (METHOD) {
                    case "text": return await BLOB.text();
                    case "bytes": return await BLOB.bytes();
                    case "base64": return btoa(await BLOB.text());
                }
            }
        }

        sliceBlob({START, END, BLOB, MIME}) {
            if (BLOB instanceof Blob)
                return BLOB.slice(START, END, MIME)
        }

        createUrl({BLOB}) {
            if (BLOB instanceof Blob) {
                let url = URL.createObjectURL(BLOB);
                urls.push(url);
                return url
            }
        }

        revokeUrl({blobURL}) {
            URL.revokeObjectURL(blobURL);
            if (urls.includes(blobURL)) urls.splice(urls.findIndex(url => url===blobURL), 1)
        }

        revokeAll() {
            urls.forEach(url => URL.revokeObjectURL(url));
            urls = []
        }
    }

    Scratch.extensions.register(new Extension)
})(Scratch)
