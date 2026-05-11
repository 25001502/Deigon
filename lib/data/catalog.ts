export type Product = {
  handle: string;
  title: string;
  vendor: string;
  price: number;
  badge: string;
  collectionHandle: string;
  shortDescription: string;
  description: string;
  themeClass: string;
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

export const siteContent = {
  hero: {
    eyebrow: "Deigon storefront proposal",
    title: "A calmer, sharper way to shop the Deigon world.",
    description:
      "This first pass upgrades the current store into a more intentional experience: clearer collections, stronger product presentation, and a checkout journey that feels trustworthy on mobile.",
  },
  featuredHeading: "Signature drops with a cleaner point of view.",
  featuredCopy:
    "The product mix stays familiar, but the storefront feels more editorial, more premium, and easier to browse at a glance.",
  story:
    "Deigon works best when it feels curated, not crowded. The demo leans into that by giving each product line room to breathe, tightening the hierarchy, and letting fashion and fragrance live under one brand without looking mismatched.",
  stats: [
    { label: "Collections in view", value: "3 focused edits" },
    { label: "Delivery message", value: "5 to 10 business days" },
    { label: "Pickup promise", value: "Ready in 24 hours" },
  ],
} as const;

export const collections: Collection[] = [
  {
    handle: "foxygeon-collections",
    title: "FOXYGEON Collections",
    tagline: "Street-led essentials",
    description:
      "A tighter edit of hoodies, statements, and easy everyday pieces with stronger visual rhythm.",
    themeClass: "theme-collection-foxygeon",
  },
  {
    handle: "patron-fragrance",
    title: "Patron Fragrance",
    tagline: "Evening character",
    description:
      "Warm amber, clean citrus, and confident scent profiles framed like premium hero products.",
    themeClass: "theme-collection-patron",
  },
  {
    handle: "weekend-rotation",
    title: "Weekend Rotation",
    tagline: "Mix-and-match entry point",
    description:
      "A discovery layer that lets new visitors understand the brand quickly without scanning the whole catalog.",
    themeClass: "theme-collection-weekend",
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
    shortDescription: "Amber-heavy evening fragrance with warmth and grip.",
    description:
      "A bold amber profile designed for close spaces, cooler evenings, and the kind of confidence that does not need to shout.",
    themeClass: "theme-after-hours",
    featured: true,
  },
  {
    handle: "azure-chill",
    title: "Azure Chill",
    vendor: "Patron Fragrance",
    price: 300,
    badge: "Fresh profile",
    collectionHandle: "patron-fragrance",
    shortDescription: "A crisp fragrance direction with a cleaner daytime feel.",
    description:
      "The lighter counterpart in the fragrance range, positioned as a fresh, bright pickup for daily wear.",
    themeClass: "theme-azure-chill",
    featured: true,
  },
  {
    handle: "blaze-baller",
    title: "Blaze Baller",
    vendor: "FOXYGEON",
    price: 400,
    badge: "Statement drop",
    collectionHandle: "foxygeon-collections",
    shortDescription: "A louder fashion piece styled as a hero card, not a crowded tile.",
    description:
      "The product remains expressive, but the presentation becomes more premium and easier to understand on first pass.",
    themeClass: "theme-blaze-baller",
    featured: true,
  },
  {
    handle: "champions",
    title: "Champions",
    vendor: "FOXYGEON",
    price: 350,
    badge: "Core layer",
    collectionHandle: "foxygeon-collections",
    shortDescription: "A flexible streetwear piece grounded with cleaner product framing.",
    description:
      "This item anchors the apparel collection with a strong but more trustworthy e-commerce presentation.",
    themeClass: "theme-champions",
    featured: true,
  },
  {
    handle: "foxygeon-hoodie",
    title: "Foxygeon Hoodie",
    vendor: "FOXYGEON",
    price: 500,
    badge: "Heavyweight",
    collectionHandle: "foxygeon-collections",
    shortDescription: "A hero outerwear piece for the apparel story.",
    description:
      "Presented as a premium wardrobe anchor with enough spacing and hierarchy to feel intentional.",
    themeClass: "theme-foxygeon-hoodie",
  },
  {
    handle: "tropical-tribe",
    title: "Tropical Tribe",
    vendor: "FOXYGEON",
    price: 380,
    badge: "Color-led piece",
    collectionHandle: "foxygeon-collections",
    shortDescription: "A brighter entry in the lineup for summer-oriented styling.",
    description:
      "Grouped into a lighter discovery edit so the catalog feels navigable rather than random.",
    themeClass: "theme-tropical-tribe",
  },
  {
    handle: "no-destruction",
    title: "No Destruction",
    vendor: "FOXYGEON",
    price: 250,
    badge: "Everyday pickup",
    collectionHandle: "foxygeon-collections",
    shortDescription: "A simpler piece framed as an easy add-on purchase.",
    description:
      "The copy, price block, and category context are tightened so the product has a clear role in the catalog.",
    themeClass: "theme-no-destruction",
  },
  {
    handle: "richer-than-my-ex-crop-top",
    title: "Richer Than My Ex - Crop Top",
    vendor: "FOXYGEON",
    price: 150,
    badge: "Impulse buy",
    collectionHandle: "foxygeon-collections",
    shortDescription: "A playful, lower-ticket item surfaced in a more deliberate way.",
    description:
      "Positioned as an easy discovery product instead of getting lost in a dense slider.",
    themeClass: "theme-richer-than-my-ex",
  },
];

export function getFeaturedProducts() {
  return products.filter((product) => product.featured);
}

export function getFoxygetonCollectionProducts() {
  return products.filter((product) => !product.featured && product.collectionHandle === "foxygeon-collections");
}

export function getProductByHandle(handle: string) {
  return products.find((product) => product.handle === handle);
}

export function getCollectionByHandle(handle: string) {
  return collections.find((collection) => collection.handle === handle);
}

export function getProductsByCollection(handle: string) {
  return products.filter((product) => product.collectionHandle === handle);
}