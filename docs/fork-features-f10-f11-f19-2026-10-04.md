# F10, F11 ve F19 uygulama notu

2026-10-04 tarihinde fork araştırmasındaki üç iyileştirme mevcut MonoCode akışlarına uyarlandı.

- **F10:** Klasör kapatılınca görünmeyen alt dizinlerin cache ve bekleyen istek kayıtları temizlenir. Bir üst klasör kapalıysa alt klasörün hatırlanan genişletme durumu onu görünür saymaz. Son explorer kapandığında ilgili cache bırakılır; başka açık explorer'ın kullandığı dizinler korunur. Yenileme en fazla dört eşzamanlı okuma kullanmayı sürdürür.
- **F11:** Aynı yol için en yeni istek cache'i yazabilir. Silinen/daraltılan dizine geç gelen cevap cache'i geri dolduramaz. Eski bir hata yeni listeyi silemez veya uzak bağlantı durumunu değiştiremez. Değişmeyen listelerin dizi kimliği ve bağlantı hatasında uzak makinenin son listesini gösterme davranışı korunur.
- **F19:** Her kuyruk mesajı kendi provider/model/modelSettings kopyasını taşır. Effort da bu ayarların içindedir. Sıralama, düzenleme ve diskten geri yükleme seçimi korur. Yerel gönderim mevcut provider geçiş/handoff akışını kullanır. Uzak gönderim kaydedilen seçimin host'a uygulanmasını bekler. Kullanılamayan uzak provider mesajı yanlış provider ile göndermek yerine kuyrukta tutar. Çalışan turdan farklı model/effort ile kaydedilmiş mesaj Steer yerine yeni turu bekler.

Eski sürümlerden kalan ve model kaydı olmayan kuyruklar mevcut oturum seçimiyle çalışmaya devam eder. Yeniden başlatma sonrasındaki kullanıcı onayı/bekletme davranışı korunur. Provider hesabı ve çalışma izinleri bu değişiklikle mesaj başına sabitlenmez.

## Kaynak commitler

- F10: sambhavthakkar/monocode — `ebd829c65875bd60c64eef73ab3e29cf15da51b3`, `f2e97d5c9d0f46c14c5c3e3cfec4ae8eb1f563ed`, `23ca13cabc23185f8b5cd5e82ded5273fa8e293f`.
- F11: sambhavthakkar/monocode — `46cfb764326eeda3ee18b61e6cf6b564d428f2ab`, `1af9a7b2af35bc76d01a0315471ffc2dc789e5ec`.
- F19: zaesho/monocode — `0a5ff028cf0a534cc38720efee7046547c6bf713`; provider geçişi mevcut yerel handoff akışına uyarlandı.

Tam commit bağlantıları ve ilk karşılaştırma [fork araştırmasında](./fork-research-2026-10-04.md) bulunur. Commitler bütünüyle cherry-pick edilmedi.

## Doğrulama

Explorer modeli/UI, kuyruk modeli, persistence, düzenleme, session store ve remote queue testleri; ayrıca RemoteSession UI testleri: toplam **176 farklı hedefli test geçti**. Yeni senaryolar cache budama, eski cevap/hata, offline liste, yeniden açma, model/effort kopyası, restart, sıra değiştirme ve uzak provider/model ayarlarının gönderim öncesinde uygulanmasını kapsar.

`npm run build`, son değişikliklerden sonra `tsc --noEmit` ve `git diff --check` başarılı. RemoteSession testinde önceki testten kalan composer taslağının sonraki Stop düğmesi kontrolünü bozması, önceki testin taslağı temizlemesiyle giderildi. Test grubunda mevcut React `act` uyarıları bulunuyor.

Uzak host davranışı test doubles ile kontrol edildi; canlı host ve paketlenmiş Windows uygulaması üzerinde ayrıca smoke test yapılmadı. Commit, push veya yayın yapılmadı.
