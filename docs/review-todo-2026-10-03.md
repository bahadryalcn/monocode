# İnceleme TODO listesi — 3 Ekim 2026

## Kapsam ve kanıt

İlk incelemede Git'te staged, unstaged veya untracked olan dosyalar bulguların kapsamı dışında tutuldu. İnceleme sırasında çalışma ağacı yeniden kontrol edildi; o sırada değişmeye başlayan dosyalar da dışlandı. İlk incelemede uygulama koduna müdahale edilmedi. Sonrasında kullanıcının talebiyle aşağıdaki 10 madde düzeltildi. Önceki diff kaydırma değişikliği ve devam eden Tasks/Goals çalışmasının derleme hataları bu listede yok.

Bu, özellikle Git/diff, ortak kaydırma ve uzak host işlemlerine odaklanan kaynak incelemesidir; ürünün tamamının cihaz üzerinde doğrulandığı anlamına gelmez. **Tekrarlandı** doğrudan yerel deney, **Kaynakta doğrulandı** ilgili kontrol akışının incelenmesi demektir. P1 önce ele alınmalı; P2 normal hata düzeltme sırasına alınmalı.

## P1 — Veri kaybı ve yanlış Git işlemi

- [x] **T01 — Tek dosya Git işlemlerinde dosya adını literal pathspec olarak kullan.**
  - Kaynak: `src-tauri/src/fs.rs:3142`, `:3218`, `:3223`; `host/workspace.ts:768`, `:800`.
  - Sorun: `--` seçenek ayrımını sağlıyor ama glob eşleşmesini kapatmıyor. `a[1].txt` seçilince `a1.txt` de eşleşiyor; stage/unstage/discard beklenmeyen dosyalara uygulanabilir.
  - Kanıt: **Tekrarlandı.** Ayrı bir geçici repoda `git add -- 'a[1].txt'` çalıştırıldı; cached listede hem `a[1].txt` hem `a1.txt` oluştu.
  - Yapılacak: Dosya hedefleyen komutlarda `--literal-pathspecs` veya eşdeğer literal pathspec uygula; toplu ve conflict işlemlerini de aynı kurala göre kontrol et.
  - Kabul: Köşeli parantez içeren dosya ve onunla eşleşen başka bir dosya varken her işlem yalnızca seçilen dosyayı etkilesin.

- [x] **T02 — Diff ekranındaki Discard için kullanıcı onayı ekle.**
  - Kaynak: `src/features/source-control/ui/WorkingTreeDiff.tsx:245`. Mevcut doğru örnek: `src/features/source-control/ui/GitChangesPanel.tsx:590`.
  - Sorun: Diff ekranı `gitDiscardFile` çağrısını doğrudan yapıyor. Changes panelinde aynı işlem onay alıyor. Untracked dosyalarda bu işlem dosyayı silebilir.
  - Kanıt: **Kaynakta doğrulandı.** Diff callback'inde onay yok; Changes panelinde dosya türüne göre Delete/Discard onayı var.
  - Yapılacak: Ortak onay davranışını iki yüzeyde de kullan; untracked dosya silinmesi ile tracked değişikliklerin geri alınmasını ayrı anlat.
  - Kabul: İptal edilen işlem Git çağrısı yapmasın; tracked ve untracked dosyalar için doğru açıklama gösterilsin.

## P2 — Kaydırma ve işlem güvenilirliği

- [x] **T03 — Ortak overscroll kontrolünün çapraz touchpad hareketini kesmesini düzelt.**
  - Kaynak: `src/shared/hooks/useLockOverscroll.ts:14`, `:74`.
  - Sorun: `atTop || atBottom || atLeft || atRight` bir eksen sınırdaysa tüm wheel olayını iptal ediyor. Yatayda en soldayken küçük bir negatif deltaX, dikeyde hâlâ yer olsa bile aşağı kaydırmayı engelleyebilir. Hook FileTree, Settings ve GitGraph gibi başka yüzeylerde de kullanılıyor.
  - Kanıt: **Tekrarlandı.** `scrollTop=100`, `scrollLeft=0`, iki eksende taşma ve `{deltaX:-1, deltaY:40}` için `atScrollEdge=true`, `hasScrollRoom=true` çıktı.
  - Yapılacak: Bir eksende kalan kaydırma alanını koru; gerçekten tükenen hareketi sınırla. Ctrl/Shift hareketlerini de regresyon kapsamına al.
  - Kabul: Sınırdaki yatay eksen dikey kaydırmayı, sınırdaki dikey eksen yatay kaydırmayı durdurmasın; gerçek sınırda overscroll korunmalı.

- [x] **T04 — Diff ekranındaki Git mutasyonlarını sırala ve busy durumunu tüm işlem süresince koru.**
  - Kaynak: `src/features/source-control/ui/WorkingTreeDiff.tsx:230`, `:245`, `:261`. Örnek kuyruk: `src/features/source-control/ui/GitChangesPanel.tsx:613`.
  - Sorun: Callback'ler tek bir `busyId` yazıyor ama kuyruk veya girişte busy kontrolü yok. Farklı dosyalarda hızlı stage tıklamaları aynı anda index yazabilir; ilk biten işlem diğerinin busy durumunu temizler. Git index.lock hatasına yol açabilir.
  - Kanıt: **Kaynakta doğrulandı;** gerçek eşzamanlı Git yarışı bu incelemede çalıştırılmadı.
  - Yapılacak: Promise kuyruğu veya ortak mutasyon yöneticisi kullan; file ve hunk işlemlerini aynı sırada yürüt.
  - Kabul: Geciktirilmiş iki işlemle en fazla bir Git mutasyonu çalışsın ve kalan işlem bitmeden busy temizlenmesin.

- [x] **T05 — Diff ekranında stage/discard/hunk hatalarını görünür kıl.**
  - Kaynak: `src/features/source-control/ui/WorkingTreeDiff.tsx:230-289`.
  - Sorun: Üç callback de yalnızca `try/finally` kullanıyor. Başarısız mutasyonun hatası yerel UI durumuna taşınmıyor; işlem yükleme durumundan çıkıyor ama kullanıcı neden başarısız olduğunu göremiyor.
  - Kanıt: **Kaynakta doğrulandı.** Görünen `error` durumu diff yükleyicisinden geliyor; mutasyon callback'leri bu durumu güncellemiyor.
  - Yapılacak: Mutasyon hatasını yakala, kullanıcıya göster ve başarı bildirimi/refresh'i yalnızca başarılı işlemden sonra uygula.
  - Kabul: Kilitli index veya başarısız backend çağrısında açıklama görünsün; işlem tekrar denenebilsin.

- [x] **T06 — İlk commit yapılmamış repolarda Unstage davranışını destekle.**
  - Kaynak: `src-tauri/src/fs.rs:3218`, `:1226`; `host/workspace.ts:800`.
  - Sorun: Tek dosya unstage `git restore --staged` kullanıyor; bu komut HEAD bulunmasını gerektiriyor. Yeni repo oluşturup dosyayı stage eden kullanıcı ilk commit öncesinde tek dosyayı unstage edemiyor. Yerel unstage-all da aynı komutu kullanıyor.
  - Kanıt: **Tekrarlandı.** Geçici repoda stage sonrası restore komutu `fatal: could not resolve HEAD` verdi.
  - Yapılacak: Unborn HEAD durumunu ayrı ele al; dosyaları çalışma ağacından silmeden index'ten çıkar.
  - Kabul: İlk commitsiz repoda tek dosya ve tüm dosyalar unstage edilebilsin; disk içerikleri aynı kalsın.

- [x] **T07 — Uzak host Push işlemi mevcut upstream'i takip etsin.**
  - Kaynak: `host/workspace.ts:860`; yönlendirme: `host/workspace-commands.ts:183`. Yerel karşılık: `src-tauri/src/fs.rs:3349`.
  - Sorun: Host her seferinde `git push -u origin HEAD` çalıştırıyor. Başka bir remote/branch'e bağlı upstream'i dikkate almıyor ve başarılı push'ta upstream'i yeniden ayarlayabilir. Yerel backend upstream varsa normal `git push` kullanıyor.
  - Kanıt: **Kaynakta doğrulandı;** dış remote'a push yapılmadı.
  - Yapılacak: Upstream varsa onu koru; ilk push için uygun remote'u çöz. Yerel ve uzak davranışı eşitle.
  - Kabul: `upstream/topic` takip eden branch origin'e gönderilmesin ve tracking ayarı değişmesin; origin olmayan tek remote'lu repo da desteklensin.

- [x] **T08 — Uzak host Push için ağ işlemine uygun timeout ve hata mesajı kullan.**
  - Kaynak: `host/workspace.ts:67`, `:860`. Ayrı Git action katmanındaki örnek: `host/git-actions.ts` içindeki `NETWORK_MS`.
  - Sorun: Push, tüm komutlar için 10 saniye timeout kullanan helper'dan geçiyor. Yavaş bağlantı, büyük push veya uzun pre-push hook'unda geçerli işlem erken öldürülebilir.
  - Kanıt: **Kaynakta doğrulandı;** yavaş ağ deneyi yapılmadı.
  - Yapılacak: Helper'a işlem bazlı timeout ver; ağ işlemlerine uygun süre ve belirgin timeout mesajı ekle. Terminal üzerinden kimlik doğrulama beklenmesini de kontrol et.
  - Kabul: Kontrollü gecikmeyle 10 saniyeyi aşan geçerli push tamamlanabilsin; gerçekten süresi dolan işlem açık mesaj versin.

- [x] **T09 — Yeni diff yüklemesi başlarken önceki hata durumunu temizle.**
  - Kaynak: `src/features/source-control/ui/CommitDiff.tsx:32`, `:43`; `SessionChangesDiff.tsx:34`, `:43`; `WorkingTreeDiff.tsx:57`, `:69`.
  - Sorun: `error` yalnızca başarılı cevap geldiğinde temizleniyor. Başarısız yüklemeden sonra başka commit/session/projeye geçildiğinde eski hata, yeni yükleme boyunca yeni bağlamın hatası gibi görünüyor. Geçersiz bağlama dönüşte erken return de hatayı temizlemiyor.
  - Kanıt: **Kaynakta doğrulandı.** Render'da hata kontrolü loading kontrolünden önce geliyor.
  - Yapılacak: Yeni bağlam/yükleme başında error'ı sıfırla veya yükleme durumlarını tek modelde tut; retry imkânı ekle.
  - Kabul: A yüklemesi hata verdikten sonra B yüklenirken A'nın hatası görünmesin; B için loading ve ardından doğru sonuç gösterilsin.

- [x] **T10 — Session diff içinde dosya seçimini tüm diff'i yeniden yüklemekten ayır.**
  - Kaynak: `src/features/source-control/ui/SessionChangesDiff.tsx:43`, `:105`.
  - Sorun: `focusPath` effect bağımlılığı. Her dosya seçimi status ve bütün dosya diff isteklerini yeniden başlatıyor; `files=null` ve boş diff Map'i yüzünden ekran loading'e dönüyor. Büyük session'da tekrar eden IO ve gözle görülür yanıp sönme oluşabilir.
  - Kanıt: **Kaynakta doğrulandı;** cihazda performans ölçümü yapılmadı.
  - Yapılacak: Veri yüklemeyi cwd/session/review değişikliklerine bağla; focus'u kaydırma ve henüz yüklenmeyen dosyanın önceliği için kullan.
  - Kabul: Yüklenmiş iki dosya arasında seçim status/diff çağrılarını tekrarlamasın ve ekranda loading sıçraması olmasın.

## Doğrulama notları

### Düzeltme sonrası doğrulama

- T01/T06: Host ve Rust geçici repo testleri; stage, unstage ve discard işlemlerinin eşleşen diğer dosyayı koruması ve unborn HEAD'de diskteki dosyaları silmeden unstage.
- T02/T04/T05: UI testleri; onay/iptal, file+hunk işlemlerinin sırayla çalışması, doğru busy durumu, başarısız işlemden sonra hata gösterimi ve yeniden deneme.
- T03: Çapraz hareket, iki eksenin sınırları ve Ctrl/Shift wheel olayları için regresyon testleri.
- T07: Gerçek ağ yerine iki yerel geçici remote ile ilk push ve mevcut upstream'in korunması.
- T08: Runtime testinde 120 saniye timeout, terminal prompt'un kapatılması ve açık timeout mesajı. Gerçek yavaş ağ/120 saniye bekleme deneyi yapılmadı.
- T09/T10: Commit/session/working-tree hata temizleme ve retry; focus değişirken yeni yükleme başlatılmaması ve henüz yüklenmemiş dosyanın önceliğinin güncellenmesi.
- 33 web test dosyasında **336 test** geçti. 3 host test dosyasında **23 test** geçti. Web ve host TypeScript kontrolleri geçti.
- `npm run build` üretim derlemesi ve değişen Rust dosyasının format kontrolü geçti. Vite mevcut `::highlight` CSS ve büyük chunk uyarılarını verdi; derlemeyi engellemedi.
- Rust Git test taramasında **103 test geçti**; mevcut `git_output_capped_cancels_a_silent_child` testi paralel çalışmada 3 saniyelik sınırını aştı. Aynı test tek başına tekrar çalıştırıldığında **1,04 saniyede geçti**. Yeni literal-path ve unborn-HEAD testleri geçti.
- Literal pathspec ayarı yalnızca dosya hedefleyen komutlara uygulandı; stash ve arama desenleri korunarak regresyonları kontrol edildi.
- Native uygulamada gerçek mouse/touchpad ve dış ağ doğrulaması hâlâ yapılmadı.

### İlk incelemenin kanıtları

- T01 ve T06 gerçek projeye dokunmadan geçici Git reposunda tekrarlandı.
- T03 mevcut export'lar doğrudan çağrılarak tekrarlandı.
- Değişiklik olmayan 507 web test dosyası seçildi: **504 dosya geçti, 3 dosya atlandı; 5.444 test geçti, 14 test atlandı** (142 saniye). Testlerin import ettiği ortak bağımlılıklar devam eden değişiklikleri içerebilir; sonuç bağımsız bir temiz checkout sonucu değildir. Mevcut testlerin geçmesi, yukarıdaki uç durumların kapsandığı anlamına gelmez.
- Uzak ağ/push, native masaüstü ve gerçek mouse/touchpad doğrulaması yapılmadı.
- Uygulamadan önce kaynakların hâlâ değişiklik kapsamı dışında olduğunu tekrar kontrol edin; aktif çalışma ağacı inceleme sırasında da değişiyordu.
