# Windows ve MacBook yerel güncellemesi

Her yerel güncellemede aynı giriş noktasını kullanın. Windows proje klasöründen:

```powershell
.\scripts\update-local.ps1 -Version 0.8.71
```

Sürüm zaten doğruysa `-Version` gerekmez. Komut mevcut çalışma ağacını bir kez sabitler; Windows ve `macbook` SSH bilgisayarında aynı kaynağı paralel derler. Git dalını değiştirmez, commit/push veya herkese açık release yapmaz. `.scratch`, belgeler ve Python bytecode'u kaynak paketine alınmaz.

Önce yapılacakları görmek, derlemeden kurulumu tekrar denemek veya durumu okumak için:

```powershell
.\scripts\update-local.ps1 -Plan
.\scripts\update-local.ps1 -InstallOnly
.\scripts\update-local.ps1 -Status
.\scripts\update-local.ps1 -BuildOnly
```

`-InstallOnly` bu akışın son paketini kullanır; yeni kaynak kopyası oluşturmaz ve derlemez. `-Platforms windows` / `-Platforms mac` tek bilgisayar seçer. Mac üzerinde kendi mevcut checkout'undan yalnız Mac güncellemesi: `sh scripts/update-local.sh`.

`-BuildOnly` iki makinenin uygulama ve host paketlerini derler ve doğrular; kurulum yardımcılarını başlatmaz. `-InstallOnly` ile birlikte kullanılmaz. Mac için aynı seçenek `sh scripts/update-local.sh --build-only` komutudur.

## Süreyi azaltan davranışlar

- Sabit build klasörü `~/.monocode-build/source`: gerçek `node_modules` kullanılır; her çalıştırmada yeni klasör veya junction açılmaz.
- pnpm 12.8.2 kullanılır. `package.json` değişmediyse mevcut `node_modules` korunur ve install çalışmaz. Yalnız `package.json` değiştiğinde yönetilen build klasörünün `node_modules` dizini temizlenip `pnpm install --frozen-lockfile --prefer-offline` çalışır; dizin yoksa ilk kurulum yapılır. Lockfile değişikliği, eksik build-cache ve `-ForceBuild` bağımlılık kurdurmaz. İlk kez izlemeye alınan mevcut bağımlılıklar korunur.
- `verifyDepsBeforeRun: false` ile pnpm'in `run`/`exec` öncesinde otomatik install yapması kapalıdır; kurulum kararını yalnız koordinatör verir.
- Web, host ve native girdileri ayrı izlenir. Yalnız host değiştiğinde web/native derleme tekrarlanmaz. Başarılı aşamalar hemen kaydedilir; sonraki aşama başarısız olsa da tekrar koşuda baştan başlanmaz.
- Web bir kez derlenir; Tauri'nin ikinci `beforeBuildCommand` çalıştırması engellenir.
- Host Node arşivi kalıcı checksum kontrollü önbellekte tutulur. Yerel host paketlemesi `--directory-only` kullanır: dağıtım ZIP/tar sıkıştırması ve tekrar açılması yoktur.
- Varsayılan yerel mod, yalnız bu komutun Cargo ortamında LTO'yu kapatır, 16 codegen unit ve incremental derlemeyi açar. Normal release ayarları değişmez. Tam release optimizasyonu için `-Release`; zorunlu taze derleme için `-ForceBuild` kullanılır.
- Cargo target klasörleri ve SSH/Python yolu `scripts/local-update.config.json` içinde sabittir. Windows mevcut `target`, Mac mevcut `~/projects/monocode/target` önbelleğini kullanır.

Yeni optimizasyon ayarlarının ilk koşusu kendi Cargo önbelleğini doldurabilir. Hızlanma henüz gerçek build ile ölçülmedi; sabit bir dakika garantisi yoktur. Aynı girdilerde başarılı paketler yeniden kullanılır. Başka bir derlemenin ortak target'taki binary/installer'ı değiştirmesi checksum ile yakalanır.

## Kurulum kuralları

Her bilgisayarda host ve uygulama için iki bağımsız gizli yardımcı vardır. Host kendi veritabanındaki çalışan oturumları; uygulama kendi `in_flight_sessions` tablosunu bekler. Birinin aktif olması diğerini durdurmaz. Veritabanı okunamazsa beklenir; hata sıfır aktif oturum sayılmaz.

Host servisi Windows'ta kendi lifecycle komutuyla durdurulur; `Stop-ScheduledTask` ile node.exe yetim bırakılmaz. Servis scripti ve launcher aynı şablondan yeniden yazılır. Mac'te aynı LaunchAgent'ın runtime yolları değiştirilir. Yeni hostun süreç yolu, sağlık durumu ve SQLite bütünlüğü doğrulanır; başarısız servis geçişinde eski config geri yüklenir.

Windows host'un kayıtlı PID'i zaten sona ermişse kapatma isteği gönderilmez;
koordinatör boşta DB ve durmuş servis kontrollerinden sonra paketi kurar. PID
hâlâ çalışıyorsa lifecycle hatası kurulumu durdurur; bağlantı hatası boşta sayılmaz.

Veritabanı yedeklemeleri 15 saniyeyle sınırlıdır ve bağlantılar açık bırakılmaz. Uygulama tur bitişini bekledikten sonra kapanır. Mac bundle imzası/sürümü, Windows installer ve updater imzası dosyalarının checksum'ı, kurulu binary'nin derlenen binary ile eşleşmesi kontrol edilir. Rollback dosyaları paket klasöründe korunur. Mac notarization bu yerel akışta yapılmaz.

Çifte kurulum engellenir. Başka paketin bekleyen yardımcısı veya önceki ad-hoc kurulum yardımcısı hâlâ çalışıyorsa yeni akış derlemeye başlamadan o bilgisayar için hata verir. Eski 0.8.70 yardımcılarının bitişinden sonra bu ortak akış kullanılmalıdır; mevcut işleri kesmek için süreç öldürmez.

Loglar, süreler, immutable payload ve manifest: `~/.monocode-build/runs/<kaynak-id>-<mod>/`. Bekleyen/bitmiş/başarısız kurulum durumları: `~/.monocode-host/update-jobs/{host,app}.json`; `-Status` bunları iki bilgisayardan okur. Mac build logu koordinatörün `.monocode-build/mac-<id>.log` dosyasındadır. Kurulum yardımcıları komut bittikten sonra çalışmaya devam eder; "scheduled" güncellemenin tamamlandığı anlamına gelmez.

Ön koşullar: Python 3.12+, mevcut Node/pnpm 12.8.2/Rust/Tauri araçları, kurulu MonoCode host servisi, Windows updater imza anahtarı dosyası ve `macbook` SSH bağlantısı. Script ek araç kurmaz, Intel Mac veya tüm host platformlarını gereksiz yere derlemez.

## Build almadan doğrulama

```powershell
python -B scripts/test_local_update.py
.\scripts\update-local.ps1 -Plan
```

Bu kontroller derleme/kurulum/SSH başlatmaz. Kaynak arşivinin kökü, eski kaynak temizliği, önbellek korunması, yalnız package.json değişiminde bağımlılık kurulumu, kilitli DB'de yedek zaman sınırı, hata durumunda boşta kabul edilmemesi ve ikinci yardımcı engeli test edilir. Gerçek build ve uçtan uca kurulum bu script sürümüyle henüz yapılmadı.


Yerel güncellemeler ve CI/release workflowları `pnpm-lock.yaml` kullanır. `package-lock.json` mevcut sürüm değiştirme scripti ve eski kilit kaydı için korunur; kurulum kararına katılmaz.
