// Правки проекта android/ после «npx cap add android»: иконки, версия, подпись, разрешения.
import { cpSync, readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const app = join(here, "android", "app");
const version = JSON.parse(readFileSync(join(here, "..", "package.json"), "utf8")).version;
const code = Number(process.env.GITHUB_RUN_NUMBER || 1);

// иконки (static/icons → android-app/res, сделаны один раз скриптом на Python)
cpSync(join(here, "res"), join(app, "src", "main", "res"), { recursive: true });

// версия и подпись (ключ — секрет репозитория, в Git его нет: workflow кладёт файл android-app/cherta.keystore и пароль в KEYSTORE_PASSWORD)
if (!process.env.KEYSTORE_PASSWORD || !existsSync(join(here, "cherta.keystore"))) throw new Error("Нет ключа подписи: добавьте секреты KEYSTORE_BASE64 и KEYSTORE_PASSWORD (Settings → Secrets and variables → Actions)");
const gradle = join(app, "build.gradle");
let g = readFileSync(gradle, "utf8");
g = g.replace(/versionCode \d+/, `versionCode ${code}`).replace(/versionName "[^"]*"/, `versionName "${version}"`);
g += `
android {
    signingConfigs {
        release {
            storeFile file("../../cherta.keystore")
            storePassword System.getenv("KEYSTORE_PASSWORD")
            keyAlias "cherta"
            keyPassword System.getenv("KEYSTORE_PASSWORD")
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled false
        }
    }
}
`;
writeFileSync(gradle, g);

// свой плагин цвета системных полос (src/native.ts → nativeBars) и MainActivity с его регистрацией
const javaDir = join(app, "src", "main", "java", "io", "github", "akamekiller", "cherta");
mkdirSync(javaDir, { recursive: true });
for (const f of ["ChertaBarsPlugin.java", "MainActivity.java"]) cpSync(join(here, "native", f), join(javaDir, f));

// микрофон — «Тоны → Произношение»
const manifest = join(app, "src", "main", "AndroidManifest.xml");
let m = readFileSync(manifest, "utf8");
for (const perm of ["android.permission.RECORD_AUDIO", "android.permission.MODIFY_AUDIO_SETTINGS"]) {
  if (!m.includes(perm)) m = m.replace("</manifest>", `    <uses-permission android:name="${perm}" />\n</manifest>`);
}
writeFileSync(manifest, m);
console.log(`android: версия ${version} (${code})${existsSync(join(app, "src", "main", "res", "mipmap-xxxhdpi", "ic_launcher.png")) ? ", иконки на месте" : ""}`);
