import Unzip from "@xmcl/unzip";
import { AnnotationVisitor, ClassReader, ClassVisitor, MethodVisitor, Opcodes } from "java-asm";
import { EOL } from "os";

export namespace Forge {
    class ModAnnotationVisitor extends AnnotationVisitor {
        constructor(readonly map: { [key: string]: any }) { super(Opcodes.ASM5); }
        public visit(s: string, o: any) {
            this.map[s] = o;
        }
    }
    class DummyModConstructorVisitor extends MethodVisitor {
        private stack: any[] = [];
        constructor(private parent: ModClassVisitor, api: number) {
            super(api);
        }
        visitLdcInsn(value: any) {
            this.stack.push(value);
        }
        visitFieldInsn(opcode: number, owner: string, name: string, desc: string) {
            if (opcode === Opcodes.PUTFIELD) {
                const last = this.stack.pop();
                if (last) {
                    if (name === "modId") {
                        this.parent.guess.modid = last;
                    } else if (name === "version") {
                        this.parent.guess.version = last;
                    } else if (name === "name") {
                        this.parent.guess.name = last;
                    } else if (name === "url") {
                        this.parent.guess.url = last;
                    } else if (name === "parent") {
                        this.parent.guess.parent = last;
                    } else if (name === "mcversion") {
                        this.parent.guess.mcversion = last;
                    }
                }
            }
        }
    }

    class ModClassVisitor extends ClassVisitor {
        public fields: { [name: string]: any } = {};
        public className: string = "";
        public isDummyModContainer: boolean = false;
        public isPluginClass: boolean = false;

        public commonFields: any = {};
        public constructor(readonly map: { [key: string]: any }, public guess: any, readonly corePlugin?: string) {
            super(Opcodes.ASM5);
        }
        visit(version: number, access: number, name: string, signature: string, superName: string, interfaces: string[]): void {
            this.className = name;
            this.isPluginClass = name === this.corePlugin;
            if (superName === "net/minecraftforge/fml/common/DummyModContainer") {
                this.isDummyModContainer = true;
            }
        }

        public visitMethod(access: number, name: string, desc: string, signature: string, exceptions: string[]) {
            if (this.isDummyModContainer && name === "<init>") {
                return new DummyModConstructorVisitor(this, Opcodes.ASM5);
            }
            return null;
        }

        public visitField(access: number, name: string, desc: string, signature: string, value: any) {
            this.fields[name] = value;
            return null;
        }

        public visitAnnotation(desc: string, visible: boolean): AnnotationVisitor | null {
            if (desc === "Lnet/minecraftforge/fml/common/Mod;" || desc === "Lcpw/mods/fml/common/Mod;") { return new ModAnnotationVisitor(this.map); }
            return null;
        }
    }

    /**
     * Represent the forge config file
     */
    export interface Config {
        [category: string]: {
            comment?: string,
            properties: Array<Config.Property<any>>,
        };
    }

    export namespace Config {
        export type Type = "I" | "D" | "S" | "B";
        export interface Property<T = number | boolean | string | number[] | boolean[] | string[]> {
            readonly type: Type;
            readonly name: string;
            readonly comment?: string;
            value: T;
        }

        /**
         * Convert a forge config to string
         */
        export function stringify(config: Config) {
            let content = "# Configuration file\n\n\n";
            const propIndent = "    ", arrIndent = "        ";
            Object.keys(config).forEach((cat) => {
                content += `${cat} {\n\n`;
                config[cat].properties.forEach((prop) => {
                    if (prop.comment) {
                        const lines = prop.comment.split("\n");
                        for (const l of lines) {
                            content += `${propIndent}# ${l}\n`;
                        }
                    }
                    if (prop.value instanceof Array) {
                        content += `${propIndent}${prop.type}:${prop.name} <\n`;
                        prop.value.forEach((v) => content += `${arrIndent}${v}\n`);
                        content += `${propIndent}>\n`;
                    } else {
                        content += `${propIndent}${prop.type}:${prop.name}=${prop.value}\n`;
                    }
                    content += "\n";
                });
                content += `}\n\n`;
            });
            return content;
        }

        /**
         * Parse a forge config string into `Config` object
         * @param body The forge config string
         */
        export function parse(body: string): Config {
            const lines = body.split("\n").map((s) => s.trim())
                .filter((s) => s.length !== 0);
            let category: string | undefined;
            let pendingCategory: string | undefined;

            const parseVal = (type: Type, value: any) => {
                const map: { [key: string]: (s: string) => any } = {
                    I: Number.parseInt,
                    D: Number.parseFloat,
                    S: (s: string) => s,
                    B: (s: string) => s === "true",
                };
                const handler = map[type];
                return handler(value);
            };
            const config: Config = {};
            let inlist = false;
            let comment: string | undefined;
            let last: any;

            const readProp = (type: Type, line: string) => {
                line = line.substring(line.indexOf(":") + 1, line.length);
                const pair = line.split("=");
                if (pair.length === 0 || pair.length === 1) {
                    let value;
                    let name;
                    if (line.endsWith(" <")) {
                        value = [];
                        name = line.substring(0, line.length - 2);
                        inlist = true;
                    } else { }
                    if (!category) {
                        throw {
                            type: "CorruptedForgeConfig",
                            reason: "MissingCategory",
                            line,
                        };
                    }
                    config[category].properties.push(last = { name, type, value, comment } as Property);
                } else {
                    inlist = false;
                    if (!category) {
                        throw {
                            type: "CorruptedForgeConfig",
                            reason: "MissingCategory",
                            line,
                        };
                    }
                    config[category].properties.push({ name: pair[0], value: parseVal(type, pair[1]), type, comment } as Property);
                }
                comment = undefined;
            };
            for (const line of lines) {
                if (inlist) {
                    if (!last) {
                        throw {
                            type: "CorruptedForgeConfig",
                            reason: "CorruptedList",
                            line,
                        };
                    }
                    if (line === ">") { inlist = false; } else if (line.endsWith(" >")) {
                        last.value.push(parseVal(last.type, line.substring(0, line.length - 2)));
                        inlist = false;
                    } else { last.value.push(parseVal(last.type, line)); }
                    continue;
                }
                switch (line.charAt(0)) {
                    case "#":
                        if (!comment) {
                            comment = line.substring(1, line.length).trim();
                        } else {
                            comment = comment.concat("\n", line.substring(1, line.length).trim());
                        }
                        break;
                    case "I":
                    case "D":
                    case "S":
                    case "B":
                        readProp(line.charAt(0) as Type, line);
                        break;
                    case "<":
                        break;
                    case "{":
                        if (pendingCategory) {
                            category = pendingCategory;
                            config[category] = { comment, properties: [] };
                            comment = undefined;
                        } else {
                            throw {
                                type: "CorruptedForgeConfig",
                                reason: "MissingCategory",
                                line,
                            };
                        }
                        break;
                    case "}":
                        category = undefined;
                        break;
                    default:
                        if (!category) {
                            if (line.endsWith("{")) {
                                category = line.substring(0, line.length - 1).trim();
                                config[category] = { comment, properties: [] };
                                comment = undefined;
                            } else {
                                pendingCategory = line;
                            }
                        } else {
                            throw {
                                type: "CorruptedForgeConfig",
                                reason: "Duplicated",
                                line,
                            };
                        }
                }
            }
            return config;
        }
    }

    export interface ModIndentity {
        readonly modid: string;
        readonly version: string;
    }
    export interface MetaData extends ModIndentity {
        readonly modid: string;
        readonly name: string;
        readonly description?: string;
        readonly version: string;
        readonly mcversion?: string;
        readonly acceptedMinecraftVersions?: string;
        readonly updateJSON?: string;
        readonly url?: string;
        readonly logoFile?: string;
        readonly authorList?: string[];
        readonly credits?: string;
        readonly parent?: string;
        readonly screenShots?: string[];
        readonly fingerprint?: string;
        readonly dependencies?: string;
        readonly accpetRemoteVersions?: string;
        readonly acceptSaveVersions?: string;
        readonly isClientOnly?: boolean;
        readonly isServerOnly?: boolean;
    }

    async function tweakMetadata(zip: Unzip.CachedZipFile, modidTree: any) {
        const entry = zip.entries["META-INF/MANIFEST.MF"];
        if (!entry) { return; }
        const data = await zip.readEntry(entry);
        const manifest = data.toString().split(EOL).map((l) => l.split(":").map((s) => s.trim()))
            .reduce((a, b) => ({ ...a, [b[0]]: b[1] }), {}) as any;
        if (manifest.TweakMetaFile) {
            const file = manifest.TweakMetaFile;
            const metadata = {
                modid: manifest.TweakName,
                name: manifest.TweakName,
                authors: [manifest.TweakAuthor],
                version: manifest.TweakVersion,
                description: "",
                url: "",
            };
            const metaFileEntry = zip.entries[`META-INF/${file}`];
            if (metaFileEntry) {
                const metadataContent = await zip.readEntry(metaFileEntry).then((s) => s.toString()).then(JSON.parse);
                if (metadataContent.id) {
                    metadata.modid = metadataContent.id;
                }
                if (metadataContent.name) {
                    metadata.name = metadataContent.name;
                }
                if (metadataContent.version) {
                    metadata.version = metadataContent.version;
                }
                if (metadataContent.authors) {
                    metadata.authors = metadataContent.authors;
                }
                if (metadataContent.description) {
                    metadata.description = metadataContent.description;
                }
                if (metadataContent.url) {
                    metadata.url = metadataContent.url;
                }
            }
            if (metadata.modid) {
                modidTree[metadata.modid] = metadata;
            }
        }
        return manifest;
    }


    async function asmMetaData(zip: Unzip.CachedZipFile, modidTree: any, manifest?: any) {
        let corePluginClass: string | undefined;
        if (manifest) {
            if (typeof manifest.FMLCorePlugin === "string") {
                const pluginEntry = zip.entries[manifest.FMLCorePlugin.replace(/\./g, "/")];
                if (pluginEntry) {
                    corePluginClass = pluginEntry.fileName;
                }
            }
        }
        const guessing: any = {};
        await Promise.all(zip.filterEntries((e) => e.fileName.endsWith(".class"))
            .map(async (entry) => {
                const data = await zip.readEntry(entry);
                const metaContainer: any = {};
                const visitor = new ModClassVisitor(metaContainer, guessing, corePluginClass);
                new ClassReader(data).accept(visitor);
                if (Object.keys(metaContainer).length === 0) {
                    if (visitor.className === "Config" && visitor.fields && visitor.fields.OF_NAME) {
                        metaContainer.modid = visitor.fields.OF_NAME;
                        metaContainer.name = visitor.fields.OF_NAME;
                        metaContainer.mcversion = visitor.fields.MC_VERSION;
                        metaContainer.version = `${visitor.fields.OF_EDITION}_${visitor.fields.OF_RELEASE}`;
                        metaContainer.description = "OptiFine is a Minecraft optimization mod. It allows Minecraft to run faster and look better with full support for HD textures and many configuration options.";
                        metaContainer.authorList = ["sp614x"];
                        metaContainer.url = "https://optifine.net";
                        metaContainer.isClientOnly = true;
                    }
                }
                for (const [k, v] of Object.entries(visitor.fields)) {
                    switch (k.toUpperCase()) {
                        case "MODID":
                        case "MOD_ID":
                            guessing.modid = guessing.modid || v;
                            break;
                        case "MODNAME":
                        case "MOD_NAME":
                            guessing.name = guessing.name || v;
                            break;
                        case "VERSION":
                        case "MOD_VERSION":
                            guessing.version = guessing.version || v;
                            break;
                        case "MCVERSION":
                            guessing.mcversion = guessing.mcversion || v;
                            break;
                    }
                }
                const modid = metaContainer.modid;
                let modMeta = modidTree[modid];
                if (!modMeta) {
                    modMeta = {};
                    modidTree[modid] = modMeta;
                }

                for (const propKey in metaContainer) {
                    modMeta[propKey] = metaContainer[propKey];
                }
            }));
        if (guessing.modid && !modidTree[guessing.modid]) {
            modidTree[guessing.modid] = guessing;
        }
    }

    async function jsonMetaData(zip: Unzip.CachedZipFile, modidTree: any) {
        function readJsonMetadata(json: any) {
            if (json instanceof Array) {
                for (const m of json) { modidTree[m.modid] = m; }
            } else if (json.modList instanceof Array) {
                for (const m of json.modList) { modidTree[m.modid] = m; }
            } else if (json.modid) {
                modidTree[json.modid] = json;
            }
        }
        const entry = zip.entries["mcmod.info"];
        if (entry) {
            try {
                const json = JSON.parse(await zip.readEntry(entry).then((b) => b.toString("utf-8")));
                readJsonMetadata(json);
            } catch (e) { }
        } else {
            try {
                const jsons = await Promise.all(zip.filterEntries((e) => e.fileName.endsWith(".info"))
                    .map((e) => zip.readEntry(e).then((b) => b.toString()).then(JSON.parse)));
                jsons.forEach(readJsonMetadata);
            } catch (e) { }
        }
    }

    async function regulize(mod: Buffer | string | Unzip.CachedZipFile) {
        let zip;
        if (mod instanceof Buffer || typeof mod === "string") {
            zip = await Unzip.open(mod);
        } else {
            zip = mod;
        }
        return zip;
    }
    /**
     * Read metadata of the input mod.
     *
     * This will scan the mcmod.info file, all class file for `@Mod` & coremod `DummyModContainer` class.
     * This will also scan the manifest file on `META-INF/MANIFEST.MF` for tweak mod.
     *
     * @param mod The mod path or data
     */
    export async function readModMetaData(mod: Buffer | string | Unzip.CachedZipFile) {
        const zip = await regulize(mod);
        const modidTree: any = {};
        const promise: Array<Promise<void>> = [];
        promise.push(jsonMetaData(zip, modidTree));
        promise.push(tweakMetadata(zip, modidTree));
        promise.push(asmMetaData(zip, modidTree));
        await Promise.all(promise);
        const modids = Object.keys(modidTree);
        if (modids.length === 0) { throw { type: "NonmodTypeFile" }; }
        return modids.map((k) => modidTree[k] as Forge.MetaData)
            .filter((m) => m.modid !== undefined);
    }

    /**
     * Read metadata of the input mod.
     *
     * This will scan the mcmod.info file, all class file for `@Mod` & coremod `DummyModContainer` class.
     * This will also scan the manifest file on `META-INF/MANIFEST.MF` for tweak mod.
     *
     * @param mod The mod path or data
     */
    export async function meta(mod: Buffer | string | Unzip.CachedZipFile) {
        return readModMetaData(mod);
    }

    export const DEFAULT_FORGE_MAVEN = "http://files.minecraftforge.net";
}

export default Forge;
