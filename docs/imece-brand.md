> Güncel sahne kararı (2026-10-07): Sahne şeffaf zeminde gri 0/1 karakterlerinden oluşan code arttır. Bize bakan altı farklı amcanın hepsinde çay vardır; orta ikilinin arasında tek sehpalı tavla bulunur. Oda ve dekor yoktur. İki kişi bacak bacak üstüne atar, iki kişi yaslanır. Hareket yalnızca sırayla ve aralıklı çay içme pozlarıdır. Session arkasında aynı çizim düşük opaklıkla gösterilir. Aşağıdaki eski görsel kararlar tarihçedir.

# İmece marka sistemi

## Güncel kahvehane yönü: ince piksel sanatı — 2026-10-07

Önceki SVG figürleri kullanıcı geri bildirimiyle kaldırıldı. Güncel dekorasyon 1040×340 mantıksal pikselde kodla çizilen, kenar yumuşatması kapalı bir canvas sahnesidir. Yedi amca ayrı yüz, kıyafet ve oturuşlara sahiptir; iki tavla masası, ortada çay sohbeti ve gazete okuma grupları oluşturur. Sahne koyu ahşap, soluk zeytin, arduvaz ve sıcak gri palet kullanır. Tavla masaları dekorasyondur; oynanabilir oyun, skor veya kullanıcı kontrolü eklenmez.

Hareketler ayrı çizilmiş pozlar arasında geçiş yapar: göz kırpma, konuşma, bardağı kaldırma/yudumlama ve tavla taşı hamlesi. Oda katmanı önbelleğe alınır; yalnız değişen pozlarda yeniden boyanır. Gizli, görünmeyen veya hareket tercihi kapalı sahnede zamanlayıcı çalışmaz. Sohbet arka planı ve sahneyi kapatma ayarı korunur. Aşağıdaki SVG tasarım kayıtları tarihsel yönü anlatır.

İmece, yapay zekâ araçlarının birlikte iş üretmesini sağlayan çalışma platformudur. İsim kullanıcı tarafından seçildi; görsel yön kullanıcının gönderdiği Türk çay tabağı referansı üzerine kuruldu.

## Amblem ve varlıklar

- Ana amblem: `public/brand/imece-mark.png`. 2026-10-07 kullanıcı geri bildirimiyle tema paletine uyarlandı: şeffaf PNG, antrasit tabak, altı geniş gümüş-gri dilim, sade iç halka ve merkezde altı yapraklı rozet. Küçük boyutlar için ince bitkisel süsler kaldırıldı; klasik Türk çay tabağının dalgalı çevresi korundu.
- Kaynak üretim: `01a1138f-784d-7f11-9683-b7fa7c1435b4/exec-aa0e3b2c-568b-42b4-ab35-5432551200ab.png`, ImageGen. Üretim aracından alınan dosya değiştirilmeden proje içine kopyalandı.
- Alternatif: `public/brand/imece-mark-geometric.png`, aynı paletin daha geometrik, boş merkezli yorumu. Kaynak: aynı üretim klasöründe `exec-442a73b2-4e98-4d57-885d-eae611c8865a.png`. Önceki bordo-altın amblem `public/brand/imece-mark-legacy.png` içinde korunur.
- Paket ikonları: `src-tauri/icons/`, aynı amblemden `pnpm exec tauri icon public/brand/imece-mark.png --output src-tauri/icons` ile üretildi. ICO, ICNS ve platform PNG'leri aynı kaynağı kullanır.
- Metin işareti kodda **İmece** olarak çizilir; noktalı büyük İ korunur. Dosya/paket adı **Imece**, uygulama kimliği `com.imece.desktop`.

## Görsel dil

| Kullanım | Değer |
|---|---|
| Ana çalışma yüzeyi | Siyah grafit, yaklaşık `#080A0D` |
| Panel ve araç yüzeyi | Koyu nötr grafit |
| Arayüz vurgusu | Soğuk gri |
| Amblem detayları | Grafit `#15191F`, soğuk gümüş `#A3ACB8`, porselen gri `#DEE3EA` hedef paleti |
| Yazı | Aptos / Segoe UI Variable / sistem sans |

Amblemi esnetmeyin; etrafında en az yüksekliğinin dörtte biri kadar boşluk bırakın. Küçük kontrollerde ürün amblemi yerine yeni vektör ikon ailesini kullanın. Üçüncü taraf sağlayıcı logoları ilgili sağlayıcıyı tanımlar; İmece amblemi olarak kullanılmaz.

Yeni arayüz kompakt editör başlıkları, nötr ayırıcılar, görev giriş alanı ve kısa geçişler kullanır. Ayarlar üst kategori sekmeleri ve iki kolonlu düz form bölümleriyle düzenlenir. Sahne tek renkli grafit SVG çizimidir; aktif sohbetlerde düşük opaklıkla arka planda görünür. Piksel karakter, sağlayıcıya göre değişen karşılama ve parçacık patlaması kaldırılır. Kullanıcının son kararıyla oyunlar tamamen kaldırılmıştır. Boş sohbet ekranında SVG koduyla çizilmiş yedi köy kahvehanesi amcası hilal düzeninde izleyiciye dönük oturur; yelek, hırka, bere, bıyık, sandalye ve ince belli çay bardağı detayları bulunur. Seyrek çay yudumlama, sohbet jestleri ve konuşma hareketleri vardır; skor, klavye oyun kontrolü veya oyun düğmesi yoktur. Sahne kapatılabilir; dekoratif hareket kapatma ve işletim sistemi azaltılmış hareket tercihi korunur. Görünmeyen veya gizli penceredeki sahne statik kalır.

Sesler kendi WebAudio nota dizilerinden oluşur; dış ses dosyası veya önceki cue koleksiyonu kullanılmaz. Başlangıçta ses çalmaz; bildirim tercihleri ve sessiz mod geçerlidir.

## Kahvehane çizimi, ikinci tasarım geçişi — 2026-10-07

Sahne 1440×460 SVG geometrisiyle baştan çizildi. Yedi ayrı yüz ve oturuş, çapraz bacak/açık diz pozları, açık hırka, kazak, kareli gömlek ve yelek, düz kasket, tespih ve gazete detayları kullanılır. Kemerli avlu, zemin çizgileri ve perspektifli mobilyalar kompozisyonu birleştirir. Bardaklar kucak/göğüs hizasında tutulur; üç kişide farklı gecikme ve sürelerle kol/elin birlikte yükseldiği çay hareketi vardır. Bardak yüzün önünde çizilir ve her kişinin ağız hizasına ayrı hareket hedefi kullanır. Arka plan varyantı ve azaltılmış hareket/gizli pencere kapıları korunur.

## Yayın sınırları

Marka tescili/alan adı kontrolü yapılmadı. Yayıncı, destek adresi, imzalama kimliği ve bağımsız güncelleme/host dağıtım adresi henüz sağlanmadı. Bu alanlar için eski ürünün adresi kullanılmaz. Mevcut MIT telif ve izin metni korunur. Üretilen sanat için marka tescili veya münhasır hak iddiası yoktur.
