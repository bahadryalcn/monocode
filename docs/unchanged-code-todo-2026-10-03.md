# Değişmemiş kod incelemesi — TODO

Tarih: 3 Ekim 2026.

## Kapsam ve kanıt sınırı

- İnceleme başlangıcında 1.471 takipli dosya vardı. Staged, unstaged ve untracked toplam 77 yol kapsam dışında tutuldu; 1.394 takipli dosya kapsam için uygundu. Bu sayı her dosyanın tek tek ayrıntılı incelendiği anlamına gelmez.
- Değişmiş dosyalar hakkında bulgu üretilmedi. `docs/review-todo-2026-10-03.md` mevcut ve untracked olduğundan okunmadı veya değiştirilmedi. Uygulama koduna müdahale edilmedi.
- Envanter ve örüntü taramasından sonra ortak UI, notlar, dosya/doküman görüntüleme, uzak workspace işlemleri, arama, PR kontrolleri, başlangıç ve CI yapılandırmasında hedefli kaynak incelemesi yapıldı.
- Son Git kontrolünde host/workspace-commands.ts, host/workspace.ts ve src-tauri/src/fs.rs dosyalarının inceleme sırasında değişmiş olduğu görüldü. Bu dosyalara bağlı 03, 07, 09 ve 22 numaralı maddeler kapsamdan çıkarıldı; kalan 19 madde için son kontrolde değişmiş dosya referansı yok. Numaralar izlenebilirlik için korunmuştur.
- Canlı masaüstü arayüzü açılmadı; ekran görüntüsü, gerçek SSH bağlantısı, büyük doküman benchmark'ı veya tam test/build çalıştırılmadı. Görsel değerlendirmeler koddan görülen kullanılabilirlik ve erişilebilirlik sorunlarıdır; estetik ve kontrast değerlendirmesi canlı doğrulama gerektirir.
- **Kesin:** kaynakta doğrudan görülen sorun. **Risk:** koşula bağlı olası hata; belirtilen senaryo ile doğrulanmalı. **Bakım:** mimari/UX iyileştirmesi, tek başına işlevsel hata değildir.
- P1: veri kaybı, izinlerin bozulması veya uygulamanın açılmaması. P2: işlev, güvenilirlik, performans ve erişilebilirlik. P3: bakım ve tasarım iyileştirmesi.

## P1 — Önce ele alınacaklar

- [ ] **01 — Silme hatasından sonra not kaydını tekrar etkinleştir. [Kesin]**
  - Kanıt: [NotesView.tsx](../src/features/notes/ui/NotesView.tsx), satır 229–242, 615, 896–903. Delete eylemi `skipSave.current = true` yapıyor. `onDelete` hatayı yakalayıp normal tamamlanıyor; bayrak geri alınmıyor.
  - Etki: silinemeyen not ekranda kalıyor, kullanıcı düzenlemeye devam edebiliyor ancak `persist` sonraki kayıtları atlıyor.
  - TODO: silme sonucunu açık biçimde döndür; başarısızlıkta bayrağı geri al, düzenlemeleri koru ve görünür hata göster.
  - Kabul: `notes_delete` reddedildiğinde sonraki düzenleme diske kaydolmalı; başarı halinde not yeniden oluşmamalı.

- [ ] **02 — Not değiştirme/kapatma sırasında başarısız kaydın taslağını koru. [Kesin]**
  - Kanıt: [NotesView.tsx](../src/features/notes/ui/NotesView.tsx), satır 541–548, 658–661, 786–790. Editör `key={note.id}` ile yeniden kuruluyor; unmount kaydı fire-and-forget. Kayıt hatası eski komponentin state'ine yazılıp `current` döndürülüyor.
  - Etki: not değiştirildikten veya görünüm kapatıldıktan sonra kaydı başarısız olan düzenlemeye ve hata mesajına yeniden erişilemiyor.
  - TODO: başarısız taslakları editör dışında sakla; notu yeniden açınca kurtar, kayıt durumunu görünüm kapanınca da göster.
  - Kabul: düzenle → kayıt IPC'sini reddet → başka nota geç → geri dön akışında taslak ve yeniden deneme korunmalı.

- [ ] **04 — Bootstrap hatasında kurtarılabilir başlangıç ekranı göster. [Kesin]**
  - Kanıt: [main.tsx](../src/main.tsx), satır 30, 91–124. Dinamik App import'u ve diğer başlangıç promise'leri `Promise.all(...).then(...)` içinde; zincirin rejection handler'ı yok. Splash ancak render edilen BootGate ile kaldırılıyor.
  - Etki: bu promise'lerden biri reddedilirse root render edilmez; kullanıcı splash üzerinde kalabilir ve yeniden deneme seçeneği bulamaz.
  - TODO: başlangıç hatasını yakala; okunabilir hata, yeniden deneme ve tanılama yolu sun. Kısmi başlangıç verilerinin hangisinin zorunlu olduğunu ayır.
  - Kabul: App yükleme veya bootstrap reddi kontrollü hata ekranına dönüşmeli; yeniden deneme çalışmalı.

## P2 — Hata, güvenilirlik, performans ve kullanılabilirlik

- [ ] **05 — Not yükleme hatasını boş liste gibi göstermeyi bırak. [Kesin]**
  - Kanıt: [notes.ts](../src/features/notes/notes.ts), satır 75–90; [NotesView.tsx](../src/features/notes/ui/NotesView.tsx), satır 139–158. `loadNotes` hatayı yutup boş/eski cache'i döndürüyor; çağıran görünüm bunu başarılı yükleme sayıp hatayı temizliyor.
  - TODO: hata ve stale veri durumlarını ayrı taşı; mevcut notları koruyarak hata/Retry göster.
  - Kabul: ilk yükleme reddinde “not yok” görünmemeli; refresh reddinde eski veri ve hata birlikte görünmeli.

- [ ] **06 — Not cache'inde geç cevapların yeni veriyi ezmesini önle. [Risk]**
  - Kanıt: [notes.ts](../src/features/notes/notes.ts), satır 75–103. `refresh=true` mevcut inflight isteği paylaşmıyor; her cevap koşulsuz `cache = notes` yapıyor. Mutasyon sonrası invalidasyon için generation kontrolü yok.
  - TODO: refresh ve mutasyonlara generation ekle; eski isteğin cache'i değiştirmesini engelle.
  - Kabul: eski list isteğini beklet → not güncelle → yeni listeyi tamamla → eski cevabı getir; güncel not eski içerikle değiştirilmemeli.

- [ ] **08 — Bozuk uzak komut outbox girdisini kontrollü şekilde yönet. [Risk]**
  - Kanıt: [connections.ts](../src/features/connections/model/connections.ts), satır 179–212. `readPendingEntry` doğrudan JSON parse ve `"command" in parsed` kullanıyor; okuyucularda şema doğrulaması ve bozuk girdiye özel hata yönetimi yok.
  - Etki: bozuk JSON veya `null` tek girdiden exception üretebilir; bekleyen komutları okumak engellenebilir.
  - TODO: sürümlü şema doğrulaması, görünür kurtarma durumu ve bozuk girdiyi karantinaya alma ekle. Belirsiz komutları sessizce silme veya tekrar gönderme.
  - Kabul: bozuk girdi sağlam girdilerin okunmasını engellememeli; kullanıcı hangi isteğin belirsiz olduğunu görmeli.

- [ ] **10 — PR revision değişiminde önceki isteğin cevabını geçersiz kıl. [Kesin]**
  - Kanıt: [useGithubPrChecks.ts](../src/features/inbox/hooks/useGithubPrChecks.ts), satır 71–88, 120–145. `revision` effect'i tetikliyor ancak epoch yalnızca kimlik değişiminde/disable'da artıyor. Aynı PR'nin eski isteği cevap verince kabul ediliyor; yeni istek sonradan başlıyor.
  - TODO: revision'ı istek kimliğine kat; eski sonucu kabul etme, değişim sırasında eski kontrolleri açıkça stale göster.
  - Kabul: eski commit isteği beklerken revision değiştir; geç cevap yeni revision'ın geçerli sonucu olarak gösterilmemeli.

- [ ] **11 — Konuşma araması hatalarını görünür hale getir. [Kesin]**
  - Kanıt: [SearchView.tsx](../src/features/search/ui/SearchView.tsx), satır 327–338. Konuşma aramasının catch'i sonuçları temizliyor; dosya aramasından farklı olarak hata mesajı oluşturmuyor.
  - TODO: dosya ve konuşma arama hatalarını ayrı taşı; kısmi başarılı sonuçlarla birlikte Retry sun.
  - Kabul: `searchSessionContent` reddedildiğinde “sonuç yok” yerine arama hatası görünmeli.

- [ ] **12 — Excel dönüşüm sınırlarını maliyet oluşmadan uygula. [Kesin yapı; performans etkisi ölçülmeli]**
  - Kanıt: [SheetViewer.tsx](../src/features/files/ui/SheetViewer.tsx), satır 46–60, 255–270; [documentViewer.ts](../src/features/files/model/documentViewer.ts), satır 23–24, 94–113. `sheet_to_json` tam sütun aralığını oluşturduktan sonra grid 200 sütuna kırpılıyor. İzin verilen 100.000 × 200 görünür grid bile 20 milyon hücre slotu oluşturabilir.
  - TODO: decode/conversion öncesi sütun aralığını sınırla; hücre sayısına ve toplam metne bütçe koy; görünür aralık için veri üret.
  - Kabul: çok geniş veya seyrek workbook tüm sütunları materialize etmemeli; sınır aşımı anlaşılır mesaj vermeli.

- [ ] **13 — Excel parse işlemini UI thread'inden çıkar. [Kesin yapı; gecikme ölçülmeli]**
  - Kanıt: [SheetViewer.tsx](../src/features/files/ui/SheetViewer.tsx), satır 43–66. `setTimeout(0)` sonrasında `read(bytes)` senkron çalışıyor; timeout işi başka thread'e taşımıyor.
  - TODO: worker ile parse/dönüşüm yap; iptal ve süre bütçesi ekle. Dosya değişiminde eski işi iptal et.
  - Kabul: büyük workbook açılırken pencere ve kontroller kullanılabilir kalmalı; başka dosyaya geçince eski işlem durmalı.

- [ ] **14 — Modal içinde odak döngüsü ve kapatınca odak iadesi ekle. [Kesin]**
  - Kanıt: [Modal.tsx](../src/shared/ui/Modal.tsx), satır 54–72, 84–89, 150–163. Close'a başlangıç odağı veriliyor; Tab trap, arka plan için inert ve tetikleyiciye odak iadesi yok. `aria-modal` bunları kendiliğinden uygulamaz.
  - TODO: ortak modal katmanında odak yönetimi kur; minimalHeader ve native popup davranışlarını da kapsa.
  - Kabul: Tab/Shift+Tab dialog dışına çıkmamalı; kapatınca tetikleyiciye dönmeli; arka plan klavyeyle çalıştırılamamalı.

- [ ] **15 — İç içe popover'larda Escape'i yalnızca en üst yüzeyin tüketmesini sağla. [Risk]**
  - Kanıt: [Popover.tsx](../src/shared/ui/Popover.tsx), satır 159–177, 292–299. Her yüzey window capture listener'ı ekliyor; handler `defaultPrevented` kontrol etmiyor. `stopPropagation` aynı hedefteki diğer listener'ları durdurmaz.
  - TODO: ortak overlay stack veya tüketilmiş olay kontrolü kullan; native ve web davranışını eşitle.
  - Kabul: iki açık popover'da ilk Escape yalnızca üsttekini, ikinci Escape alttakini kapatmalı.

- [ ] **16 — Select arama alanında Home/End'in metin düzenleme davranışını koru. [Kesin]**
  - Kanıt: [SearchableSelect.tsx](../src/shared/ui/SearchableSelect.tsx), satır 157–166, 259. Arama input'una takılı handler Home/End'i her durumda önlüyor ve liste seçimini değiştiriyor.
  - TODO: metin input'unda caret hareketini koru; liste odaktayken ilk/son seçenek navigasyonu uygula.
  - Kabul: arama metninde Home/End caret'i taşımalı; liste klavye navigasyonu çalışmaya devam etmeli.

- [ ] **17 — Not silme için geri alma veya onay sun. [Kesin UX eksikliği]**
  - Kanıt: [NotesView.tsx](../src/features/notes/ui/NotesView.tsx), satır 895–906. Delete doğrudan kalıcı silme akışını başlatıyor; onay/Undo bulunmuyor.
  - TODO: tercihen kısa süreli Undo + geri alınabilir silme; aksi halde not adıyla açık onay ekle.
  - Kabul: yanlış tıklama geri alınabilmeli; silme hatasında düzenleme ve kayıt yeteneği korunmalı.

- [ ] **18 — Notes panel ayırıcısını klavyeyle kullanılabilir yap. [Kesin]**
  - Kanıt: [NotesView.tsx](../src/features/notes/ui/NotesView.tsx), satır 318–327. `role=separator` var; focus, klavye handler'ı ve değer bilgisi yok. Hook yalnızca pointer/double-click sunuyor.
  - TODO: tabIndex, klavye büyüt/küçült/reset ve aria değerleri ekle.
  - Kabul: fare olmadan panel genişliği değiştirilebilmeli; ekran okuyucu mevcut ve sınır değerlerini duyurmalı.

## P3 — Bakım ve tasarım TODO'ları

- [ ] **19 — Panel genişliğini viewport değişince yeniden sınırla. [Bakım/UX]**
  - Kanıt: [useDragResize.ts](../src/shared/hooks/useDragResize.ts), satır 41–45, 120; [NotesView.tsx](../src/features/notes/ui/NotesView.tsx), satır 110–116. Width başlangıçta ve kullanıcı etkileşiminde clamp ediliyor; pencere küçülünce yeniden hesaplanmıyor.
  - TODO: viewport/container değişiminde clamp uygula; `max < min` durumunda tutarlı sınır politikası belirle.
  - Kabul: geniş pencerede paneli büyüt → pencereyi küçült; içerik alanı belirlenen minimum kullanılabilir genişliği korumalı.

- [ ] **20 — Spreadsheet sekmelerinin ve sanal grid'in erişilebilirliğini tamamla. [Bakım/UX]**
  - Kanıt: [SheetViewer.tsx](../src/features/files/ui/SheetViewer.tsx), satır 94–114, 192–251. Tablist sekmelerinde roving focus/ok tuşu davranışı ve panel eşlemesi yok; hücreler div tabanlı, satır/sütun ilişkileri açıklanmıyor.
  - TODO: sekmelerin klavye modelini ve panel ilişkilerini kur; read-only sanal tablo için satır/sütun semantiği ve erişilebilir gezinme sun.
  - Kabul: çalışma sayfası yalnızca klavyeyle değiştirilmeli; hücre bağlamı ekran okuyucuda anlaşılmalı.

- [ ] **21 — Büyük UI modüllerini sorumluluklara böl. [Bakım]**
  - Kanıt: [SettingsView.tsx](../src/features/settings/ui/SettingsView.tsx) 5.406 satır; [InboxView.tsx](../src/features/inbox/ui/InboxView.tsx) 3.197; [FileEditor.tsx](../src/features/files/ui/FileEditor.tsx) 1.722; [ModelPicker.tsx](../src/features/sessions/ui/ModelPicker.tsx) 1.592.
  - TODO: önce SettingsView'ı bölüm komponentleri ve ayrı yükleme/mutasyon hook'larına ayır; sonra inbox sağlayıcı/detail akışlarını, editör lifecycle'ını ve picker veri modelini ayrıştır.
  - Kabul: ekranın bir bölümünü değiştirmek ilgisiz bölüm state/effect'lerine dokunmayı gerektirmemeli. Parçalara ayırmak için parçalama veya kanıtsız performans iddiası yapılmamalı.

- [ ] **23 — Tasarım token'larını ve erişilebilirlik doğrulamasını ortaklaştır. [Bakım; görsel doğrulama gerekli]**
  - Kanıt: [index.css](../src/styles/index.css) 3.416 satır; [Modal.tsx](../src/shared/ui/Modal.tsx) açıklaması 12px/50% ve truncate; [DocumentView.tsx](../src/features/files/ui/DocumentView.tsx) dosya yolu 11px/35%; [SheetViewer.tsx](../src/features/files/ui/SheetViewer.tsx) loading metni 12px/45%. Opaklık tek başına kontrast başarısızlığını kanıtlamaz.
  - TODO: yazı boyutu, secondary/disabled metin, kontrol yüksekliği ve focus token'larını tanımla. Açık/koyu tema, özelleştirilmiş accent, 800×520 pencere ve yüksek DPI'da gerçek ekran kontrolü yap. Uzun modal açıklamasını kesmek yerine sardır.
  - Kabul: kritik hata/açıklama metni kesilmeden okunmalı; klavye focus'u görünür olmalı; ölçülen kontrast ve screenshot kontrolleri kaydedilmeli. Ortak Modal testlerine focus/escape/viewport davranışı da eklenmeli; mevcut [Modal.test.ts](../src/shared/ui/Modal.test.ts) yalnızca static markup kontrol ediyor.

## Önerilen uygulama sırası

1. 01, 02, 04: not/veri güvenilirliği ve başlangıç kurtarma.
2. 05, 06, 08, 10, 11: hata durumları ve cache/outbox/request yarışları.
3. 12–18: ağır doküman işleme ve ortak klavye/overlay davranışı.
4. 19, 20, 21, 23: responsive davranış, erişilebilirlik, modül ayrıştırma ve canlı tasarım kontrolü.

Bu dosya düzeltme planıdır. Maddeler uygulanmadı; test/build veya canlı uygulama doğrulaması yapılmış gibi değerlendirilmemelidir.

