# imc code bağımsız ürün kimliği

imc code, [MonoCode by Nick](https://github.com/hardbeat920/monocode) kod tabanından türetilmiştir. MIT lisansı, telif bildirimleri ve upstream katkıların atıfları korunur.

| Alan | imc code |
| --- | --- |
| Görünür marka | imc code |
| Kurulum paket adı | imc code |
| Bundle kimliği | `com.imece.desktop` |
| Geliştirme kimliği | `com.imece.desktop.dev` |
| Windows kurulum dizini | `%LOCALAPPDATA%\imc code` |
| Mac bundle | `/Applications/imc code.app` |
| Host dizini | `~/.imece-host` |
| Mac host servisi | `com.imece.host` |
| Linux host servisi | `imece-host.service` |
| Windows host görevi | `Imece Host-<SID>` |
| Varsayılan host portu | `3775` |

imc code eski MonoCode servislerini, kimlik bilgilerini ve kullanıcı verilerini otomatik taşımaz. Windows masaüstü verileri `%APPDATA%\com.imece.desktop`, Mac verileri `~/Library/Application Support/com.imece.desktop` altında tutulur. Rust executable adı ve bazı veri dosyası/protokol anahtarları iç uyumluluk için korunur.

Yerel Windows/Mac build ve kurulum için [paylaşılan koordinatörü](local-update.md) kullanın. Windows artefaktı `target/release/bundle/nsis/imc code_<version>_x64-setup.exe` olur. Geliştirme, installer ve host paketleri bağımsız kimlik taşır.

## Yayın ve updater

Upstream veya eski fork updater feed/key bu üründe kullanılmaz. Otomatik updater endpoint/public key alanları boş ve updater artefakt üretimi kapalıdır. Bağımsız signing key, feed, release deposu ve CI akışı belirlenip doğrulanmadan eski release workflowları çalıştırılmamalıdır. Commit, push, canlı kurulum veya yayın bu değişiklikle yapılmaz.

Kaynak/test doğrulaması paketlenmiş Windows/Mac uygulamasının kurulduğunu veya servislerin çalıştığını kanıtlamaz; gerçek build ve yan yana kurulum ayrıca doğrulanmalıdır.
