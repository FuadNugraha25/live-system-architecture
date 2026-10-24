// Scenario inputs. `listing` is what the agent pasted, `aiAnswer` is the scripted
// reply from the model (including the mistakes real models make), and the
// reviewer fields are what was already on the form. All names and addresses are made up.

const RUMAH = `Dijual Rumah Cluster Asri, Gunung Sindur
LT 120 m2, LB 90 m2
KT 4+1, KM 3+1
SHM, harga 1,5 M nego

[CATATAN VENDOR, ALAMAT, FEE]
Vendor: Bu Sari
Alamat Properti: Jl. Melati Raya No. 12, Desa Pengasinan, Gunung Sindur, Bogor
Fee: 2,5%`

const RUMAH_AI = `Property Type: Rumah
Transaction Type: Jual
Sertifikat: SHM
Price: 1500000000
LT: 120
LB: 90
KT: 5
KM: 4
Vendor: Bu Sari
Address: Jl. Melati Raya No. 12, Desa Pengasinan, Gunung Sindur, Bogor
Fee: 2.5%
Province: JAWA BARAT
City: KAB. BOGOR
District: GUNUNG SINDUR`

const KAVLING_TOTAL = `Dijual Kavling Siap Bangun, Serpong
LT 130 m2, SHM
Harga total 650 juta

[CATATAN VENDOR, ALAMAT, FEE]
Vendor: Pak Hadi
Alamat: Jl. Kenanga Blok C3, Serpong
Fee: 3%`

const KAVLING_PER_METER = `Dijual Kavling Siap Bangun, Serpong
LT 130 m2, SHM
Harga Rp 5 juta/m2, total 650 juta

[CATATAN VENDOR, ALAMAT, FEE]
Vendor: Pak Hadi
Alamat: Jl. Kenanga Blok C3, Serpong
Fee: 3%`

const KAVLING_AI = `Property Type: Kavling
Transaction Type: Jual
Sertifikat: SHM
Price: 650000000
LT: 130
LB: Not specified
KT: Not specified
KM: Not specified
Vendor: Pak Hadi
Address: Jl. Kenanga Blok C3, Serpong
Fee: 3%
Province: BANTEN
City: KOTA TANGERANG SELATAN
District: SERPONG`

const NOTE_ADDRESS = `Rumah minimalis dekat stasiun, lokasi di Jl. Anggrek 7 Depok
LT 72, LB 60, KT 2, KM 1
Sertifikat hak milik, 650 juta

[CATATAN VENDOR, ALAMAT, FEE]
Vendor: Bu Rina
Alamat Properti: Jl. Anggrek No. 7, Beji, Depok
Fee: 10jt`

const NOTE_ADDRESS_AI = `Property Type: Rumah
Transaction Type: Jual
Sertifikat: Hak Milik
Price: 650000000
LT: 72
LB: 60
KT: 2
KM: 1
Vendor: Bu Rina
Address: Not specified
Fee: 10 juta
Province: Not specified
City: Not specified
District: Not specified`

const blank = { reviewerType: '', reviewerPrice: '', modelsDown: '0' }

export const scenarios = [
  {
    id: 'rumah',
    title: 'House listing, AI adds up the rooms',
    detail: 'The AI turns “KT 4+1” into 5. The function fixes it from the text.',
    input: { ...blank, listing: RUMAH, aiAnswer: RUMAH_AI },
  },
  {
    id: 'fallback',
    title: 'First two AI models are down',
    detail: 'Overloaded, then out of quota. The third model answers.',
    input: { ...blank, listing: RUMAH, aiAnswer: RUMAH_AI, modelsDown: '2' },
  },
  {
    id: 'kavling-total',
    title: 'Land listing with only a total price',
    detail: 'Land is priced per m². No per-m² price means no price at all.',
    input: { ...blank, listing: KAVLING_TOTAL, aiAnswer: KAVLING_AI },
  },
  {
    id: 'kavling-meter',
    title: 'Land listing with a per-m² price',
    detail: 'The AI picks the total anyway. The function takes the per-m² price.',
    input: { ...blank, listing: KAVLING_PER_METER, aiAnswer: KAVLING_AI },
  },
  {
    id: 'reviewer',
    title: 'Reviewer already filled some fields',
    detail: 'The reviewer chose Ruko and typed a price. Their values win.',
    input: { ...blank, listing: RUMAH, aiAnswer: RUMAH_AI, reviewerType: 'Ruko', reviewerPrice: '1,450,000,000' },
  },
  {
    id: 'address',
    title: 'AI misses the address and the certificate',
    detail: 'Address recovered from the vendor note; “Hak Milik” is rejected.',
    input: { ...blank, listing: NOTE_ADDRESS, aiAnswer: NOTE_ADDRESS_AI },
  },
  {
    id: 'all-down',
    title: 'Every AI model fails',
    detail: 'All four models error. Nothing is filled in.',
    input: { ...blank, listing: RUMAH, aiAnswer: RUMAH_AI, modelsDown: '4' },
  },
  {
    id: 'limit',
    title: '30 extractions this hour',
    detail: 'The agent hit the hourly AI limit.',
    input: { ...blank, listing: RUMAH, aiAnswer: RUMAH_AI },
    setup(db) {
      const rows = Array.from({ length: 30 }, (_, i) => ({ id: `seed-${i}`, actor_id: 'u-001', action: 'ai.extract' }))
      db.audit.push(...rows)
      return () => { db.audit = db.audit.filter((row) => !rows.includes(row)) }
    },
  },
]
