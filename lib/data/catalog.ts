export type Product = {
  handle: string;
  title: string;
  vendor: string;
  price: number;
  badge: string;
  collectionHandle: string;
  shortDescription: string;
  description: string;
  details?: string[];
  themeClass: string;
  image?: string;
  images?: string[];
  featured?: boolean;
};

export type Collection = {
  handle: string;
  title: string;
  tagline: string;
  description: string;
  themeClass: string;
};

export const announcements = [
  "Free Delivery On Orders Over R600",
  "Delivery In 5 to 10 Business Days",
];

export const storeInfo = {
  name: "Deigon",
  legalName: "FOXYGEON COLLECTIONS (PTY) LTD",
  email: "deigonofficial@gmail.com",
  phone: "+27 60 833 1697",
  pickupLocation: "Univen main gate",
  addressLines: ["Thohoyandou", "Limpopo, 0950", "South Africa"],
} as const;

export const collections: Collection[] = [
  {
    handle: "foxygeon-collections",
    title: "FOXYGEON Collections",
    tagline: "Modern streetwear",
    description:
      "Foxygeon Collections is a modern streetwear brand built on simplicity, confidence, and timeless design. Clean pieces made to be worn by anyone and anywhere.",
    themeClass: "theme-collection-foxygeon",
  },
  {
    handle: "patron-fragrance",
    title: "Patron Fragrance",
    tagline: "Signature Eau de Parfums",
    description:
      "Bold, long-lasting Eau de Parfums inspired by icons of modern luxury perfumery — crafted for evenings, power moments, and everyday confidence.",
    themeClass: "theme-collection-patron",
  },
  
  {
    handle: "all",
    title: "All Products",
    tagline: "The full catalog",
    description: "Every FOXYGEON, and Patron Fragrance, release available from Deigon in one place.",
    themeClass: "theme-collection-foxygeon",
  },
];

export const products: Product[] = [
  {
    handle: "after-hours",
    title: "After Hours",
    vendor: "Patron Fragrance",
    price: 300,
    badge: "Signature scent",
    collectionHandle: "patron-fragrance",
    shortDescription: "A deep, magnetic amber fragrance crafted for the man who owns the night.",
    description:
      "After Hours is confidence bottled — warm, addictive and unforgettable, designed for late evenings, close conversations, and moments that turn into memories. It opens with a subtle touch of brightness before melting into a rich, golden heart of smooth amber, sensual vanilla, and creamy tonka bean that lingers long after you leave the room.",
    details: [
      "Top Notes: Fresh citrus nuances",
      "Heart Notes: Warm spices & aromatic accords",
      "Base Notes: Amber, vanilla, tonka bean, resinous woods",
      "100ml Eau de Parfum",
    ],
    themeClass: "theme-after-hours",
    image:
      "https://hvawfylsdaormrkghbbw.supabase.co/storage/v1/object/sign/products/AfterHours.jpg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8wNWZkNjhlOS00ODJhLTQ1NGYtODZmYS1mMmNlOWNjY2NhZjMiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJwcm9kdWN0cy9BZnRlckhvdXJzLmpwZyIsInNjb3BlIjoiZG93bmxvYWQiLCJpYXQiOjE3ODYzODU3MDAsImV4cCI6MTgxNzkyMTcwMH0.lHxqLApJKuntdPBYSV4JTKN1403bW7laJ1HEJJctuvQ",
    featured: true,
  },
  {
    handle: "azure-chill",
    title: "Azure Chill",
    vendor: "Patron Fragrance",
    price: 300,
    badge: "Fresh profile",
    collectionHandle: "patron-fragrance",
    shortDescription: "A refreshing escape bottled — crisp citrus with a clean, musky trail.",
    description:
      "Azure Chill opens with vibrant citrus and juicy fruits, instantly cooling the senses like a coastal breeze. At its heart, smooth green and aromatic notes bring balance and clarity, while a soft musky base leaves a clean, long-lasting trail on the skin.",
    details: ["100ml Eau de Parfum"],
    themeClass: "theme-azure-chill",
    image:
      "https://hvawfylsdaormrkghbbw.supabase.co/storage/v1/object/sign/products/AzureChill.jpg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8wNWZkNjhlOS00ODJhLTQ1NGYtODZmYS1mMmNlOWNjY2NhZjMiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJwcm9kdWN0cy9BenVyZUNoaWxsLmpwZyIsInNjb3BlIjoiZG93bmxvYWQiLCJpYXQiOjE3ODYzODcxOTgsImV4cCI6MTgxNzkyMzE5OH0.stBt4sDznOW2lYx07IUZoHDqSfHi-t-qju_ddHr1wio",
    featured: true,
  },
  {
    handle: "blaze-baller",
    title: "Blaze Baller",
    vendor: "FOXYGEON",
    price: 400,
    badge: "Statement drop",
    collectionHandle: "foxygeon-collections",
    shortDescription: "A statement tee with a commanding back print and boxy silhouette.",
    description:
      "Crafted from premium 100% cotton at 300GSM for substantial weight and durability. The relaxed boxy silhouette offers contemporary comfort, with a commanding back print as the focal point and a refined left chest print for balance.",
    details: ["100% cotton, 300 GSM", "Relaxed boxy fit", "Back print + left chest print"],
    themeClass: "theme-blaze-baller",
    image: "https://www.deigon.co.za/cdn/shop/files/IMG_1985.jpg?v=1783024431&width=1200",
    images: [
      "https://www.deigon.co.za/cdn/shop/files/IMG_1985.jpg?v=1783024431&width=1200",
      "https://www.deigon.co.za/cdn/shop/files/IMG_6758.jpg?v=1783024554&width=1200",
    ],
    featured: true,
  },
  {
    handle: "champions",
    title: "Champions",
    vendor: "FOXYGEON",
    price: 350,
    badge: "Core layer",
    collectionHandle: "foxygeon-collections",
    shortDescription: "A championship-inspired tee built on 300GSM cotton with a relaxed fit.",
    description:
      "Champions embodies the spirit of championship triumph through design inspired by NBA rings — a symbol of elite achievement. Constructed from 100% cotton at 300GSM, the relaxed boxy silhouette and short sleeves project quiet confidence without compromise.",
    details: ["100% cotton, 300 GSM", "Relaxed boxy fit", "NBA rings-inspired graphic"],
    themeClass: "theme-champions",
    image: "https://www.deigon.co.za/cdn/shop/files/champion.jpg?v=1769871177&width=1200",
    images: [
      "https://www.deigon.co.za/cdn/shop/files/champion.jpg?v=1769871177&width=1200",
      "https://www.deigon.co.za/cdn/shop/files/IMG_3857.jpg?v=1782847524&width=1200",
    ],
    featured: true,
  },
  {
    handle: "foxygeon-hoodie",
    title: "Foxygeon Hoodie",
    vendor: "FOXYGEON",
    price: 350,
    badge: "Heavyweight",
    collectionHandle: "foxygeon-collections",
    shortDescription: "A heavyweight FOXYGEON hoodie, available as a pre-order.",
    description:
      "A hero outerwear piece for the FOXYGEON lineup. Currently offered as a pre-order, shipping within 5–10 business days of purchase.",
    details: ["Pre-order — ships in 5–10 business days"],
    themeClass: "theme-foxygeon-hoodie",
    image: "https://www.deigon.co.za/cdn/shop/files/6861f6c3-16b0-4eb8-a701-f879161cad56.jpg?v=1782998517&width=1200",
    images: [
      "https://www.deigon.co.za/cdn/shop/files/6861f6c3-16b0-4eb8-a701-f879161cad56.jpg?v=1782998517&width=1200",
      "https://www.deigon.co.za/cdn/shop/files/IMG_8037.jpg?v=1782998594&width=1200",
    ],
  },
  {
    handle: "no-destruction",
    title: "No Destruction",
    vendor: "FOXYGEON",
    price: 250,
    badge: "Everyday pickup",
    collectionHandle: "foxygeon-collections",
    shortDescription: "A simple, easy-to-wear FOXYGEON tee built for everyday rotation.",
    description: "A clean, versatile piece from the FOXYGEON lineup, built for everyday rotation.",
    themeClass: "theme-no-destruction",
    image: "https://www.deigon.co.za/cdn/shop/files/IMG_6493.jpg?v=1770066751&width=1200",
    images: [
      "https://www.deigon.co.za/cdn/shop/files/IMG_6493.jpg?v=1770066751&width=1200",
      "https://www.deigon.co.za/cdn/shop/files/IMG_6492.jpg?v=1770066751&width=1200",
    ],
  },
  {
    handle: "legacy-links",
    title: "Legacy Links",
    vendor: "FOXYGEON",
    price: 400,
    badge: "Heritage graphic",
    collectionHandle: "foxygeon-collections",
    shortDescription: "The Legacy Links tee brings back FOXYGEON's original Big Dog graphic.",
    description:
      "The Legacy Links T-Shirt pays tribute to the design that helped shape the FOXYGEON story. Inspired by the original dog graphic so many supporters fell in love with, it symbolizes loyalty, legacy, and the connection between where we've been and where we're going.",
    details: [
      "330 GSM heavyweight fabric",
      "100% premium cotton",
      "Short sleeve, classic round neck",
      "Relaxed, oversized streetwear fit",
      "High-quality graphic print",
    ],
    themeClass: "theme-foxygeon-hoodie",
    image:
      "https://www.deigon.co.za/cdn/shop/files/Photoroom_20260705_182357_2adcdcd4-169b-445d-807a-75d0a7436281.png?v=1783714750&width=1200",
    images: [
      "https://www.deigon.co.za/cdn/shop/files/Photoroom_20260705_182357_2adcdcd4-169b-445d-807a-75d0a7436281.png?v=1783714750&width=1200",
      "https://www.deigon.co.za/cdn/shop/files/Photoroom_20260705_182331_ef17a3e5-e56a-406c-8f48-c39713db2cda.png?v=1783714750&width=1200",
    ],
  },
  {
    handle: "tropical-tribe",
    title: "Tropical Tribe",
    vendor: "FOXYGEON",
    price: 380,
    badge: "Color-led piece",
    collectionHandle: "foxygeon-collections",
    shortDescription: "A brighter, color-led piece for summer-ready styling.",
    description: "A vibrant addition to the FOXYGEON lineup, designed for warm-weather styling and easy everyday wear.",
    themeClass: "theme-tropical-tribe",
    image:
      "https://hvawfylsdaormrkghbbw.supabase.co/storage/v1/object/sign/products/TropicalTribe.JPG?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8wNWZkNjhlOS00ODJhLTQ1NGYtODZmYS1mMmNlOWNjY2NhZjMiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJwcm9kdWN0cy9Ucm9waWNhbFRyaWJlLkpQRyIsInNjb3BlIjoiZG93bmxvYWQiLCJpYXQiOjE3ODY0NzM0MDQsImV4cCI6MTgxODAwOTQwNH0.dA3c16Tq9GNFdpl-guJnq0Z7lXidKLt53tStj806NTc",
  },
  {
    handle: "richer-than-my-ex-crop-top",
    title: "Richer Than My Ex - Crop Top",
    vendor: "FOXYGEON",
    price: 150,
    badge: "Impulse buy",
    collectionHandle: "foxygeon-collections",
    shortDescription: "A versatile crop top styled for everyday layering.",
    description:
      "This crop top delivers contemporary styling with practical construction, working seamlessly as a standalone piece or layered under jackets, shirts, and sweaters. The tailored fit flatters multiple body types while maintaining comfort throughout the day.",
    themeClass: "theme-richer-than-my-ex",
    image: "https://www.deigon.co.za/cdn/shop/files/IMG_4520.jpg?v=1770065827&width=1200",
    images: [
      "https://www.deigon.co.za/cdn/shop/files/IMG_4520.jpg?v=1770065827&width=1200",
      "https://www.deigon.co.za/cdn/shop/files/IMG_4422.jpg?v=1770065827&width=1200",
    ],
  },
  {
    handle: "divine",
    title: "Divine",
    vendor: "Patron Fragrance",
    price: 300,
    badge: "Fall favourite",
    collectionHandle: "patron-fragrance",
    shortDescription: "Warm cognac and tonka bean wrapped in golden, indulgent depth.",
    description:
      "Divine is indulgence in its purest form — warm, intoxicating, and irresistibly smooth. It opens with a bold splash of cognac before melting into cinnamon, tonka bean, and oak, settling into vanilla, praline, and sandalwood.",
    details: [
      "Top Notes: Cognac",
      "Heart Notes: Cinnamon, tonka bean, oak",
      "Base Notes: Vanilla, praline, sandalwood",
      "100ml Eau de Parfum",
    ],
    themeClass: "theme-after-hours",
    image: "https://www.deigon.co.za/cdn/shop/files/48a8d763-2ffc-48a4-ad16-ba74d5c654af.jpg?v=1771674259&width=1200",
  },
  {
    handle: "legacy-rise",
    title: "Legacy Rise",
    vendor: "Patron Fragrance",
    price: 300,
    badge: "Signature power scent",
    collectionHandle: "patron-fragrance",
    shortDescription: "A fresh, powerful scent of ambition built for leaders and visionaries.",
    description:
      "Legacy Rise opens with a vibrant burst of pineapple, bergamot, and crisp apple, before a heart of smoky birch, patchouli, and jasmine. The base of oakmoss, ambergris, vanilla, and musk creates a smooth, long-lasting trail that speaks success without effort.",
    details: [
      "Top Notes: Pineapple, bergamot, apple, blackcurrant",
      "Heart Notes: Birch, patchouli, jasmine",
      "Base Notes: Oakmoss, ambergris, vanilla, musk",
      "100ml Eau de Parfum",
    ],
    themeClass: "theme-azure-chill",
    image: "https://www.deigon.co.za/cdn/shop/files/bed5ca71-411a-448f-b6a6-9d1df97888dc.jpg?v=1771674144&width=1200",
  },
  {
    handle: "patron-absolu",
    title: "Patron Absolu",
    vendor: "Patron Fragrance",
    price: 350,
    badge: "Quiet luxury",
    collectionHandle: "patron-fragrance",
    shortDescription: "Refined power and quiet luxury in a bold, long-lasting scent.",
    description:
      "Patron Absolu is crafted for those who move with confidence and leave a lasting impression, opening with a smooth, captivating aura that settles into warm notes with a bold yet elegant presence.",
    details: ["Long-lasting, bold scent profile", "Unisex appeal", "100ml Eau de Parfum"],
    themeClass: "theme-champions",
    image: "https://www.deigon.co.za/cdn/shop/files/b9e9762d-dd24-40fb-87ac-c1b26619d390.jpg?v=1774736198&width=1200",
  },
  {
    handle: "rouge-aura",
    title: "Rouge Aura",
    vendor: "Patron Fragrance",
    price: 300,
    badge: "Signature bestseller",
    collectionHandle: "patron-fragrance",
    shortDescription: "A magnetic blend of warmth and elegance with an ambered, floral heart.",
    description:
      "Rouge Aura opens with a luminous sweetness that instantly captivates. A rich, airy heart unfolds with ambered depth and refined floral tones, while a sensual woody-musky base lingers on the skin.",
    details: ["100ml Eau de Parfum"],
    themeClass: "theme-tropical-tribe",
    image: "https://www.deigon.co.za/cdn/shop/files/F7E21BAE-B5A3-4D2A-BF13-E656EB6643C5.png?v=1770322948&width=1200",
    images: [
      "https://www.deigon.co.za/cdn/shop/files/F7E21BAE-B5A3-4D2A-BF13-E656EB6643C5.png?v=1770322948&width=1200",
      "https://www.deigon.co.za/cdn/shop/files/B05CE113-5EB3-464C-90AF-42D63B9B3C0B.png?v=1770323071&width=1200",
    ],
  },
  {
    handle: "vvip-lady",
    title: "VVIP Lady",
    vendor: "Patron Fragrance",
    price: 350,
    badge: "Night-out signature",
    collectionHandle: "patron-fragrance",
    shortDescription: "Elegant, feminine, and unforgettable — designed for the woman who owns every room.",
    description:
      "VVIP Lady opens with a sparkling, vibrant touch before delicate floral tones blend with a warm, sensual base — playful yet sophisticated, for daytime glam and night-time occasions.",
    details: ["Fresh, floral, slightly sweet luxury scent", "100ml Eau de Parfum"],
    themeClass: "theme-richer-than-my-ex",
    image: "https://www.deigon.co.za/cdn/shop/files/a3f6026f-9a8c-40ee-8e9e-d09eca64ae36.jpg?v=1774736403&width=1200",
  },
  
];

export function getFeaturedProducts() {
  return products.filter((product) => product.featured);
}

export function getFoxygetonCollectionProducts() {
  return products
    .filter((product) => !product.featured && product.collectionHandle === "foxygeon-collections")
    .slice(0, 4);
}

export function getProductByHandle(handle: string) {
  return products.find((product) => product.handle === handle);
}

export function getCollectionByHandle(handle: string) {
  return collections.find((collection) => collection.handle === handle);
}

export function getProductsByCollection(handle: string) {
  if (handle === "all") {
    return products;
  }

  return products.filter((product) => product.collectionHandle === handle);
}