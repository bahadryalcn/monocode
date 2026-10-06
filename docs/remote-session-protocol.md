# Yerel/uzak session sözleşmesi

Bu sözleşme mevcut eşleştirilmiş host RPC taşımasını genişletir. Merkezi sunucu yoktur.

## Kimlik ve otorite

Session referansı `(environmentId, sessionId)` çiftidir; bağlantı kaydının yerel `machineId` değeri session kimliği değildir. `sessionReferenceKey` çifti çakışmasız kodlar. Host değişirse mevcut bağlantı sessizce başka hosta yazamaz: native taşıma ve server environment kimliğini kontrol eder.

Session sahibi, provider agent'ını çalıştıran makine ve çalışma dizininin bulunduğu makine ayrı kavramlardır. Normal uzak proje session'ı ve agent'ı projenin hostunda oluşturulur. Yerel agent'ın SSH/MCP kullanması sahipliği değiştirmez; ilişkilendirilmemiş SSH komutları session keşfi sayılmaz. Adopted kayıt aynı host otoritesinin masaüstü görünümüdür; bağımsız yazılabilir bir kopya değildir. Açıkça oluşturulan bağımsız kopya yeni kimlik alır. Agent devri bu sözleşmeye dahil değildir.

Yazmalar sahibi hostun `commands.dispatch` işlemi ve mevcut provider kuralları üzerinden sıralanır. İkinci istemci yeni agent başlatma yetkisi kazanmaz. Host meşgulse mevcut kuyruk/busy davranışı korunur; uzak kuyruk istemciye aittir ve uygulama kapalıyken boşaltılmaz. Masaüstü tarafından başlatılmış eski yerel agent'ların yaşam döngüsü bu değişiklikle hosta taşınmaz.

## Görünüm ve geçmiş

`sessions.page` son sayfayı döndürür; istemci önceki sayfaları otomatik dolaşmaz. `HostSession.history` ilk yüklü blok indeksi (`before`), görünüm revision'ı ve toplam blok sayısını taşır. Sayfa yalnızca kendi revision'ına uygulanır. Canlı revision ilerlerken tamamlanan eski sayfa atılır; tekrar yükleme güncel cursor ile yapılır. Böylece silinen blok eski sayfadan dirilmez.

`sessions.sync` kısmi görünüm için `partial:true`, `loadedBlockIds` ve `windowStart` alır. Host güncel blok sırasındaki ilk kalan yüklü bloktan itibaren görünümü hesaplar. Delta `partial:true` içerir; `blockIds` bu görünümdeki yetkili sıradır, eksilen ID silme anlamına gelir. Yalnızca değişmiş/yeni bloklar gönderilir. Hiçbir yüklü blok kalmazsa veya revision uygun değilse güncel son sayfadan toparlanılır. Revision başına her provider token'ının ayrı olay olarak aktarılması gerekmez; biriken değişiklikler son duruma birleştirilir.

Kısmi geçmişin gönderime hazır olması, tam geçmiş olduğu anlamına gelmez. `historyPartial` ve uzak proje yolu authoritative yerel session kaydını engeller. Composer revision değişiminde yeniden mount edilmez. Taslak, ek, model/effort ve kuyruk görünümü korunur.

Yeni istemci `sessions.page` üzerinde `preview:true` gönderir. Dev bloklar açık `remoteContent` işaretiyle önizleme olarak sunulur; eski uygulamanın önizleme istemeyen sayfa sözleşmesi korunur. Yeni sayfa en fazla 100 blok/1 MiB, tek önizleme en fazla 64 KiB taşır. `sessions.block` aynı session/blok/revision için tam içeriği açık talep üzerine getirir; büyük yanıt mevcut sınırlı `syncChunk` taşımasını kullanır. Tam blok sadece hâlâ aynı revision olan görünüme uygulanır.

## Ortak kontrol hattı ve toparlanma

Kontrol kanalı mevcut eşleştirilmiş HTTP RPC'nin uzun beklemeli `machine.changes` isteğidir; SSH tüneli mevcut native bağlantı yöneticisinde paylaşılır. Rust/host taşımasına ikinci bir websocket sunucusu veya mesaj aracısı eklenmez. Boşta içerik aktarılmaz; kontrol isteği metadata değişimi veya en fazla 10 saniyelik bekleme sonunda yenilenir. Bu seçim mevcut kimlik doğrulama, bağlantı iptali ve eski-host fallback sözleşmelerini kullanır.

`machine.changes` tek makinedeki session revision ve proje etag değişikliklerini taşır. Her server başlangıcında yeni `instanceId` oluşur. Bu alan session kimliği veya kalıcı revision yerine geçmez. Epoch değişiminde `reset:true` gelir; istemci güncel görünümden toparlanır. Değişiklik bildirimi durum deltasına işaret eder; sınırsız olay günlüğü taşımaz. Snapshot revision'ından sonra yapılan kontrol isteği farklı güncel revision'ı yakalar, snapshot/abonelik arasında değişiklik kaybolmaz.

Renderer tüketicileri referans sayılı ortak kanalı kullanır. Native katman pencere kayıtlarını birleştirir ve makine başına tek kontrol isteği yürütür; ayrı veri/komut istekleri bu isteği beklemez. Kapanan son tüketici boş kayıtla aboneliğini bırakır; çöken pencerenin native kaydı 45 saniye sonra düşer. Yeni pencerenin talebi devam eden istekte yoksa sonraki birleşik istekten yakalanır. Uyku/uyanma veya kopma sonrasında aynı revision'dan güncel delta okunur; sıra/temel uyuşmazlığında son sayfa yüklenir.

Proje listesi bilinen etag üzerinde yalnızca `upserts` ve `removed` özetleri taşır. Özet temeli uyuşmuyorsa tam özet listesi alınır; bu işlem transcript indirmez. Görev etag bildirimi görev ekranının paylaşılan listesini kirli işaretler; değişmemiş görev listesi tekrar okunmaz. Görünür sohbetler içerik revision'ına abonedir. Native katman aynı anda gelen eşdeğer salt okunur istekleri birleştirir; tamamlanmış yanıtları saklamaz ve yazmaları bu birleştirmeye dahil etmez.

`machine.changes`, `sessions.lazyHistory` ve `commands.status` capability alanları yeni davranışı seçer. Eski hostların mevcut liste/sync sorguları korunur. Kimlik doğrulama ve authorization revocation kontrolü uzun bekleme öncesi ve sonrası sürer.

## Komut güvenilirliği ve bütçeler

Komut ID ve payload imzası mevcut durable receipt kaydına bağlıdır. Yanıt kaybında aynı ID aynı receipt'i döndürür; farklı payload reddedilir. `commands.status` bilinen sonucu tekrar çalıştırmadan sorgular. Receipt retention yedi gündür; yeni outbox kayıtları altı gün sonra otomatik replay dışına çıkar ve recovery için görünür kalır. Legacy tarihsiz veya doğrulanmamış dış yan etki kayıtları aynı güvenceyle değerlendirilmemelidir.

Sayfa, transfer, host snapshot cache, istemci snapshot cache, kontrol abonelikleri ve gönderim kuyruğu ayrı sınırlıdır. Gönderim kuyruğu 100 mesaj/32 MiB, tek outbox kaydı 2 MiB ve toplam outbox 100 kayıt/8 MiB ile sınırlandırılır. Sınır aşımında veri sessizce atılmaz; composer talebi kabul edilmez. Bu sayılar politika sınırıdır, ölçülmüş bellek tüketimi veya hız kazanımı değildir.

Native kontrol sınırı 64 makine, makine başına 32 pencere, 64 session ve 32 projedir; ortak salt okunur uçuşlar 64 ile sınırlıdır. Host kontrol isteği en fazla 10 saniye bekler ve en fazla 64 bekleyen istek tutar. Kısmi sync en fazla 32768 yüklü blok ID'si kabul eder. Host transferi en fazla 32 Mi UTF-16 birimi, toplam transfer cache 128 MiB ve 8 kayıttır; limit üstündeki tek içeriğin aktarımı açık hata verir. Renderer snapshot cache 8 kayıt/32 MiB, session listesi cache 256 kayıt/8 MiB, kalıcı özet cache 64 kayıt/2 MiB ile sınırlıdır. Mevcut provider stream checkpoint birleştirmesi 120 ms ve transcript turn/block memoization ile görünür turn penceresi korunur; yeni bir token olay günlüğü kurulmaz.

Yerel fixture sonuçları `remote-session-performance-evidence.md` içinde kayıtlıdır. Fiziksel MacBook–Windows iki yönlü sohbet, kod değişikliği, uyku/uyanma, kurulu sürüm ve boşta CPU/ağ kabulü ayrı ve beklemededir.

Kalıcı son sayfa cache'i ayrı IndexedDB deposudur: owner `(environmentId, sessionId)`, şema sürümü, 24 saat TTL, 8 kayıt/8 MiB ve kayıt başına 1 MiB. En fazla son 100 blok saklanır; taslak, outbox ve attachment payload'ları bu depoya yazılmaz. Bu görüntü gönderim otoritesi değildir; güncel host okuması tarafından doğrulanır. Özet yazmaları key başına birleştirilip ayrı macrotask'lerde yapılır. Cache kullanılamadığında host akışı devam eder; bu cache veritabanı authoritative session store'dan ayrıdır.
