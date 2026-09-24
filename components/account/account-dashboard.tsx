"use client";

import {
  CalendarDays,
  ChevronRight,
  Eye,
  EyeOff,
  LockKeyhole,
  MapPin,
  Package,
  Pencil,
  Plus,
  ShieldCheck,
  ShoppingBag,
  Trash2,
  Truck,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { LogoutButton } from "@/components/auth/logout-button";
import { createClient } from "@/lib/supabase/client";

type Profile = {
  name: string | null;
  email: string;
  phone: string | null;
  role: string;
  createdAt: Date;
};

type Address = {
  id: string;
  fullName: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  province: string;
  postalCode: string;
  country: string;
  phone: string | null;
};

type Order = {
  id: string;
  orderNumber: string;
  status: string;
  fulfilmentType: "DELIVERY" | "PICKUP";
  total: string;
  createdAt: Date;
};

type Props = {
  profile: Profile;
  addresses: Address[];
  orders: Order[];
};

const emptyAddress = {
  fullName: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  province: "",
  postalCode: "",
  country: "South Africa",
  phone: "",
};

const addressFields: Array<{
  name: keyof typeof emptyAddress;
  label: string;
  autoComplete: string;
  optional?: boolean;
}> = [
  { name: "fullName", label: "Full name", autoComplete: "name" },
  { name: "addressLine1", label: "Address line 1", autoComplete: "address-line1" },
  { name: "addressLine2", label: "Address line 2", autoComplete: "address-line2", optional: true },
  { name: "city", label: "City", autoComplete: "address-level2" },
  { name: "province", label: "Province", autoComplete: "address-level1" },
  { name: "postalCode", label: "Postal code", autoComplete: "postal-code" },
  { name: "country", label: "Country", autoComplete: "country-name" },
  { name: "phone", label: "Phone", autoComplete: "tel", optional: true },
];

const navigationItems: Array<{
  id: "profile" | "addresses" | "orders" | "security";
  label: string;
  icon: LucideIcon;
}> = [
  { id: "profile", label: "Profile", icon: UserRound },
  { id: "addresses", label: "Addresses", icon: MapPin },
  { id: "orders", label: "Orders", icon: Package },
  { id: "security", label: "Account Security", icon: LockKeyhole },
];

const inputClassName =
  "mt-2 w-full rounded-md border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-black focus:ring-2 focus:ring-black/10";

const cardClassName =
  "rounded-lg border border-gray-200/80 bg-white p-5 shadow-[0_12px_32px_rgba(17,24,39,0.045)] sm:p-6";

const orderDateFormatter = new Intl.DateTimeFormat("en-ZA", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "Africa/Johannesburg",
});

const memberDateFormatter = new Intl.DateTimeFormat("en-ZA", {
  month: "short",
  year: "numeric",
  timeZone: "Africa/Johannesburg",
});

function getInitials(name: string | null, email: string) {
  const source = name?.trim() || email.split("@")[0] || "D";
  const words = source.split(/\s+/).filter(Boolean);

  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");
}

function readableStatus(status: string, fulfilmentType: Order["fulfilmentType"]) {
  if (status === "READY_FOR_PICKUP") return "Ready for collection";
  if (status === "SHIPPED") return "Out for delivery";
  if (status === "DELIVERED" && fulfilmentType === "PICKUP") return "Collected";
  return status.replaceAll("_", " ").toLowerCase().replace(/^\w/, (letter) => letter.toUpperCase());
}

function statusClassName(status: string) {
  switch (status) {
    case "DELIVERED":
      return "bg-neutral-100 text-black ring-black/10";
    case "SHIPPED":
    case "READY_FOR_PICKUP":
      return "bg-sky-50 text-sky-800 ring-sky-700/10";
    case "CANCELLED":
      return "bg-red-50 text-red-700 ring-red-600/10";
    default:
      return "bg-neutral-100 text-black ring-black/10";
  }
}

function SectionHeading({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-black">
        <Icon aria-hidden="true" className="h-4.5 w-4.5" strokeWidth={1.7} />
      </span>
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-gray-900">
          {title}
        </h2>
        <p className="mt-1 text-xs leading-5 text-gray-500">{description}</p>
      </div>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  value,
  label,
}: {
  icon: LucideIcon;
  value: string | number;
  label: string;
}) {
  return (
    <div className="relative flex min-h-28 flex-col items-start gap-3 rounded-lg border border-gray-200/80 bg-white px-3 py-4 shadow-[0_10px_28px_rgba(17,24,39,0.035)] lg:min-h-24 lg:flex-row lg:items-center lg:gap-4 lg:px-5">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-black">
        <Icon aria-hidden="true" className="h-5 w-5" strokeWidth={1.6} />
      </span>
      <div className="min-w-0 pr-3 lg:pr-0">
        <p className="text-base font-semibold leading-tight text-gray-950 sm:text-lg lg:text-xl">{value}</p>
        <p className="mt-1 text-[11px] leading-4 text-gray-500 lg:mt-0.5 lg:text-xs">{label}</p>
      </div>
      <ChevronRight aria-hidden="true" className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 lg:hidden" />
    </div>
  );
}

export function AccountDashboard({
  profile: initialProfile,
  addresses: initialAddresses,
  orders,
}: Props) {
  const [profile, setProfile] = useState(initialProfile);
  const [addresses, setAddresses] = useState(initialAddresses);
  const [profileForm, setProfileForm] = useState({
    name: initialProfile.name ?? "",
    phone: initialProfile.phone ?? "",
  });
  const [addressForm, setAddressForm] = useState(emptyAddress);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [profileMessage, setProfileMessage] = useState("");
  const [addressMessage, setAddressMessage] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [showAllOrders, setShowAllOrders] = useState(false);
  const [showSecurityForm, setShowSecurityForm] = useState(false);
  const [activeSection, setActiveSection] = useState<(typeof navigationItems)[number]["id"]>("profile");

  const displayName = profile.name?.trim() || profile.email.split("@")[0];
  const deliveredOrders = orders.filter((order) => order.status === "DELIVERED").length;

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/account/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profileForm),
    });
    const data = await response.json();
    setProfileMessage(data.ok ? "Profile saved." : data.message ?? "Could not save profile.");
    if (data.ok) {
      setProfile((current) => ({ ...current, ...data.profile }));
      setIsEditingProfile(false);
    }
  }

  async function saveAddress(event: React.FormEvent) {
    event.preventDefault();
    const url = editingId ? `/api/account/addresses/${editingId}` : "/api/account/addresses";
    const response = await fetch(url, {
      method: editingId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(addressForm),
    });
    const data = await response.json();
    if (!data.ok) {
      setAddressMessage(data.message ?? "Could not save address.");
      return;
    }
    setAddresses((current) =>
      editingId
        ? current.map((address) => (address.id === editingId ? data.address : address))
        : [data.address, ...current],
    );
    setAddressForm(emptyAddress);
    setEditingId(null);
    setShowAddressForm(false);
    setAddressMessage("Address saved.");
  }

  async function deleteAddress(id: string) {
    const response = await fetch(`/api/account/addresses/${id}`, { method: "DELETE" });
    if (response.ok) setAddresses((current) => current.filter((address) => address.id !== id));
  }

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    const { error } = await createClient().auth.updateUser({ password });
    setPasswordMessage(error ? error.message : "Password updated successfully.");
    if (!error) {
      setPassword("");
      setShowSecurityForm(false);
    }
  }

  function editAddress(address: Address) {
    setEditingId(address.id);
    setAddressForm({
      fullName: address.fullName,
      addressLine1: address.addressLine1,
      addressLine2: address.addressLine2 ?? "",
      city: address.city,
      province: address.province,
      postalCode: address.postalCode,
      country: address.country,
      phone: address.phone ?? "",
    });
    setShowAddressForm(true);
    setAddressMessage("");
  }

  function startAddress() {
    setEditingId(null);
    setAddressForm(emptyAddress);
    setShowAddressForm(true);
    setAddressMessage("");
  }

  function cancelAddress() {
    setEditingId(null);
    setAddressForm(emptyAddress);
    setShowAddressForm(false);
  }

  const mobileOrders = showAllOrders ? orders : orders.slice(0, 2);

  return (
    <main className="bg-gray-50 px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
      <div className="mx-auto max-w-7xl">
        <header className="pb-5 lg:border-b lg:border-gray-200 lg:pb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-black">
            <span className="lg:hidden">Your account</span>
            <span className="hidden lg:inline">Your Deigon</span>
          </p>
          <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 lg:flex lg:items-end lg:justify-between lg:gap-6">
            <div className="min-w-0">
              <h1 className="text-3xl font-semibold leading-[1.05] text-gray-950 sm:text-4xl lg:text-5xl">
                Welcome back, {displayName}.
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-5 text-gray-600 sm:leading-6">
                Manage your details, addresses, orders, and account settings.
              </p>
            </div>

            <div className="flex min-w-0 flex-col items-center gap-2 text-center lg:flex-row lg:gap-4 lg:text-left">
              <div className="flex min-w-0 flex-col items-center gap-2 lg:flex-row lg:gap-3">
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-black text-base font-semibold text-white shadow-sm sm:h-16 sm:w-16 lg:h-14 lg:w-14">
                  {getInitials(profile.name, profile.email)}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-col items-center gap-1 lg:flex-row lg:flex-wrap lg:items-center lg:gap-2">
                    <p className="truncate text-sm font-semibold text-gray-950">{displayName}</p>
                    {profile.role ? (
                      <span className="rounded-full bg-black/5 px-2.5 py-1 text-[10px] font-semibold uppercase text-black ring-1 ring-inset ring-black/10">
                        {profile.role}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 max-w-28 truncate text-[10px] text-gray-500 sm:max-w-40 sm:text-xs lg:max-w-none">{profile.email}</p>
                </div>
              </div>
              <div className="hidden lg:block">
                <LogoutButton />
              </div>
            </div>
          </div>
        </header>

        <div className="mt-2 grid gap-6 lg:mt-6 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="hidden h-fit rounded-lg border border-gray-200/80 bg-white p-3 shadow-[0_12px_32px_rgba(17,24,39,0.04)] lg:sticky lg:top-28 lg:block">
            <p className="px-3 pb-3 pt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
              Account menu
            </p>
            <nav aria-label="Account sections" className="grid grid-cols-2 gap-1 sm:grid-cols-4 lg:grid-cols-1">
              {navigationItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeSection === item.id;

                return (
                  <a
                    key={item.id}
                    href={`#${item.id}-desktop`}
                    onClick={() => setActiveSection(item.id)}
                    className={`flex min-h-11 items-center gap-2 rounded-md px-3 py-2.5 text-xs font-medium transition sm:text-sm ${
                      isActive
                        ? "bg-gray-100 text-black shadow-[inset_3px_0_0_#000000]"
                        : "text-gray-600 hover:bg-gray-50 hover:text-gray-950"
                    }`}
                  >
                    <Icon aria-hidden="true" className="h-4 w-4 shrink-0" strokeWidth={1.7} />
                    <span className="min-w-0 flex-1">{item.label}</span>
                    <ChevronRight aria-hidden="true" className="hidden h-3.5 w-3.5 lg:block" />
                  </a>
                );
              })}
            </nav>
          </aside>

          <div className="min-w-0 space-y-4 lg:space-y-5">
            <section aria-label="Account summary" className="grid grid-cols-3 gap-2 sm:gap-3">
              <SummaryCard icon={ShoppingBag} value={orders.length} label="Total orders" />
              <SummaryCard icon={Truck} value={deliveredOrders} label="Orders delivered" />
              <SummaryCard
                icon={CalendarDays}
                value={memberDateFormatter.format(new Date(initialProfile.createdAt))}
                label="Member since"
              />
            </section>

            <div className="space-y-4 lg:hidden">
              <section id="profile" className="scroll-mt-24 rounded-lg border border-gray-200/80 bg-white p-4 shadow-[0_10px_28px_rgba(17,24,39,0.035)]">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-black">
                      <UserRound aria-hidden="true" className="h-4.5 w-4.5" strokeWidth={1.7} />
                    </span>
                    <h2 className="text-base font-semibold text-gray-950">Personal details</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (isEditingProfile) {
                        setProfileForm({ name: profile.name ?? "", phone: profile.phone ?? "" });
                      }
                      setIsEditingProfile((editing) => !editing);
                      setProfileMessage("");
                    }}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-800 transition hover:border-black/30"
                  >
                    <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
                    {isEditingProfile ? "Cancel" : "Edit"}
                  </button>
                </div>

                {isEditingProfile ? (
                  <form onSubmit={saveProfile} className="mt-4 grid gap-3 sm:grid-cols-2">
                    <label className="text-xs font-medium text-gray-700">
                      Name
                      <input
                        value={profileForm.name}
                        onChange={(event) => setProfileForm({ ...profileForm, name: event.target.value })}
                        autoComplete="name"
                        className={inputClassName}
                      />
                    </label>
                    <label className="text-xs font-medium text-gray-700">
                      Email
                      <input value={profile.email} readOnly className={`${inputClassName} bg-gray-50 text-gray-500`} />
                    </label>
                    <label className="text-xs font-medium text-gray-700">
                      Phone
                      <input
                        value={profileForm.phone}
                        onChange={(event) => setProfileForm({ ...profileForm, phone: event.target.value })}
                        autoComplete="tel"
                        className={inputClassName}
                      />
                    </label>
                    <div className="flex items-end">
                      <button className="w-full rounded-md bg-black px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-neutral-800">
                        Save changes
                      </button>
                    </div>
                  </form>
                ) : (
                  <dl className="mt-4 divide-y divide-gray-100 text-sm">
                    <div className="grid grid-cols-[92px_minmax(0,1fr)] items-center gap-3 py-2 first:pt-0">
                      <dt className="text-gray-500">Name</dt>
                      <dd className="truncate rounded-md border border-gray-100 bg-gray-50 px-3 py-2 text-gray-800">{displayName}</dd>
                    </div>
                    <div className="grid grid-cols-[92px_minmax(0,1fr)] items-center gap-3 py-2">
                      <dt className="text-gray-500">Email</dt>
                      <dd className="truncate rounded-md border border-gray-100 bg-gray-50 px-3 py-2 text-gray-800">{profile.email}</dd>
                    </div>
                    <div className="grid grid-cols-[92px_minmax(0,1fr)] items-center gap-3 py-2 last:pb-0">
                      <dt className="text-gray-500">Phone</dt>
                      <dd className="truncate rounded-md border border-gray-100 bg-gray-50 px-3 py-2 text-gray-800">{profile.phone || "Not provided"}</dd>
                    </div>
                  </dl>
                )}
                {profileMessage ? <p role="status" className="mt-3 text-sm text-black">{profileMessage}</p> : null}
              </section>

              <section id="addresses" className="scroll-mt-24 rounded-lg border border-gray-200/80 bg-white p-4 shadow-[0_10px_28px_rgba(17,24,39,0.035)]">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-black">
                      <MapPin aria-hidden="true" className="h-4.5 w-4.5" strokeWidth={1.7} />
                    </span>
                    <h2 className="text-base font-semibold text-gray-950">Delivery addresses</h2>
                  </div>
                  <button
                    type="button"
                    onClick={startAddress}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-black px-3 py-2 text-xs font-semibold text-white transition hover:bg-neutral-800"
                  >
                    <Plus aria-hidden="true" className="h-3.5 w-3.5" />
                    Add
                  </button>
                </div>

                {addresses.length > 0 ? (
                  <div className="mt-4 space-y-3">
                    {addresses.map((address) => (
                      <article key={address.id} className="rounded-md border border-gray-200 bg-gray-50/60 p-4">
                        <div className="flex items-start gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-black ring-1 ring-gray-200">
                            <MapPin aria-hidden="true" className="h-4 w-4" strokeWidth={1.7} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-gray-950">{address.fullName}</p>
                            <p className="mt-1 text-xs leading-5 text-gray-600">
                              {address.addressLine1}
                              {address.addressLine2 ? `, ${address.addressLine2}` : ""}
                              <br />
                              {address.city}, {address.province} {address.postalCode}
                              <br />
                              {address.country}
                            </p>
                          </div>
                          <ChevronRight aria-hidden="true" className="mt-2 h-4 w-4 shrink-0 text-gray-400" />
                        </div>
                        <div className="mt-3 flex justify-end gap-2 border-t border-gray-200/70 pt-3">
                          <button
                            type="button"
                            onClick={() => editAddress(address)}
                            className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700"
                          >
                            <Pencil aria-hidden="true" className="h-3 w-3" />
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteAddress(address.id)}
                            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-50"
                          >
                            <Trash2 aria-hidden="true" className="h-3 w-3" />
                            Delete
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="mt-4 rounded-md border border-dashed border-gray-200 px-4 py-5 text-center text-xs text-gray-500">
                    No delivery address saved yet.
                  </p>
                )}

                {showAddressForm ? (
                  <form id="mobile-address-form" onSubmit={saveAddress} className="mt-4 grid gap-3 border-t border-gray-100 pt-4 sm:grid-cols-2">
                    {addressFields.map((field) => (
                      <label key={field.name} className="text-xs font-medium text-gray-700">
                        {field.label}
                        {field.optional ? <span className="font-normal text-gray-400"> (optional)</span> : null}
                        <input
                          required={!field.optional}
                          value={addressForm[field.name]}
                          onChange={(event) => setAddressForm({ ...addressForm, [field.name]: event.target.value })}
                          autoComplete={field.autoComplete}
                          className={inputClassName}
                        />
                      </label>
                    ))}
                    <div className="flex gap-2 sm:col-span-2">
                      <button className="flex-1 rounded-md bg-black px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-neutral-800">
                        {editingId ? "Update address" : "Add address"}
                      </button>
                      <button type="button" onClick={cancelAddress} className="rounded-md border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700">
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : null}
                {addressMessage ? <p role="status" className="mt-3 text-sm text-black">{addressMessage}</p> : null}
              </section>

              <section id="orders" className="scroll-mt-24 rounded-lg border border-gray-200/80 bg-white p-4 shadow-[0_10px_28px_rgba(17,24,39,0.035)]">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-black">
                      <Package aria-hidden="true" className="h-4.5 w-4.5" strokeWidth={1.7} />
                    </span>
                    <h2 className="text-base font-semibold text-gray-950">Order history</h2>
                  </div>
                  {orders.length > 2 ? (
                    <button type="button" onClick={() => setShowAllOrders((showing) => !showing)} className="shrink-0 text-xs font-semibold text-black">
                      {showAllOrders ? "Show less" : "View all"}
                    </button>
                  ) : null}
                </div>

                {orders.length === 0 ? (
                  <p className="mt-4 rounded-md border border-dashed border-gray-200 px-4 py-6 text-center text-xs text-gray-500">
                    Your orders will appear here after your first purchase.
                  </p>
                ) : (
                  <div className="mt-4 overflow-hidden rounded-md border border-gray-200">
                    {mobileOrders.map((order) => (
                      <article key={order.id} className="flex items-center gap-3 border-b border-gray-100 p-3 last:border-0">
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-gray-100 text-black">
                          <Package aria-hidden="true" className="h-5 w-5" strokeWidth={1.6} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold text-gray-950">{order.orderNumber}</p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-2">
                            <span className="text-[11px] text-gray-500">{orderDateFormatter.format(new Date(order.createdAt))}</span>
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase ring-1 ring-inset ${statusClassName(order.status)}`}>
                              {readableStatus(order.status, order.fulfilmentType)}
                            </span>
                          </div>
                          <Link href={`/account/orders/${encodeURIComponent(order.id)}`} className="mt-2 inline-flex text-[11px] font-semibold text-black underline decoration-gray-300 underline-offset-4">
                            View details
                          </Link>
                        </div>
                        <p className="shrink-0 text-sm font-semibold text-gray-950">R {order.total}</p>
                      </article>
                    ))}
                  </div>
                )}
              </section>

              <section id="security" className="scroll-mt-24 rounded-lg border border-gray-200/80 bg-white p-4 shadow-[0_10px_28px_rgba(17,24,39,0.035)]">
                <button
                  type="button"
                  onClick={() => setShowSecurityForm((showing) => !showing)}
                  aria-expanded={showSecurityForm}
                  aria-controls="mobile-security-form"
                  className="flex w-full items-center gap-3 text-left"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-black">
                    <ShieldCheck aria-hidden="true" className="h-4.5 w-4.5" strokeWidth={1.7} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-semibold text-gray-950">Account security</span>
                    <span className="mt-0.5 block text-xs text-gray-500">Keep your account secure.</span>
                  </span>
                  <ChevronRight aria-hidden="true" className={`h-4 w-4 shrink-0 text-gray-500 transition ${showSecurityForm ? "rotate-90" : ""}`} />
                </button>

                {showSecurityForm ? (
                  <form id="mobile-security-form" onSubmit={changePassword} className="mt-4 border-t border-gray-100 pt-4">
                    <label className="text-xs font-medium text-gray-700">
                      New password
                      <span className="relative mt-2 block">
                        <input
                          type={showPassword ? "text" : "password"}
                          minLength={6}
                          required
                          value={password}
                          onChange={(event) => setPassword(event.target.value)}
                          placeholder="Enter new password"
                          autoComplete="new-password"
                          className="w-full rounded-md border border-gray-200 bg-white px-3.5 py-2.5 pr-11 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-black focus:ring-2 focus:ring-black/10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((visible) => !visible)}
                          aria-label={showPassword ? "Hide password" : "Show password"}
                          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-gray-400"
                        >
                          {showPassword ? <EyeOff aria-hidden="true" className="h-4 w-4" /> : <Eye aria-hidden="true" className="h-4 w-4" />}
                        </button>
                      </span>
                    </label>
                    <button className="mt-3 w-full rounded-md bg-black px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-neutral-800">
                      Update password
                    </button>
                  </form>
                ) : null}
                {passwordMessage ? <p role="status" className="mt-3 text-sm text-black">{passwordMessage}</p> : null}
              </section>

              <div className="[&>button]:w-full">
                <LogoutButton />
              </div>
            </div>

            <div className="hidden gap-5 lg:grid xl:grid-cols-2">
              <section id="profile-desktop" className={`${cardClassName} scroll-mt-28`}>
                <SectionHeading
                  icon={UserRound}
                  title="Personal details"
                  description="Keep your personal information up to date."
                />
                <form onSubmit={saveProfile} className="mt-6 grid gap-4 sm:grid-cols-2">
                  <label className="text-xs font-medium text-gray-700">
                    Name
                    <input
                      value={profileForm.name}
                      onChange={(event) =>
                        setProfileForm({ ...profileForm, name: event.target.value })
                      }
                      autoComplete="name"
                      className={inputClassName}
                    />
                  </label>
                  <label className="text-xs font-medium text-gray-700">
                    Email
                    <input
                      value={profile.email}
                      readOnly
                      className={`${inputClassName} bg-gray-50 text-gray-500`}
                    />
                  </label>
                  <label className="text-xs font-medium text-gray-700">
                    Phone
                    <input
                      value={profileForm.phone}
                      onChange={(event) =>
                        setProfileForm({ ...profileForm, phone: event.target.value })
                      }
                      autoComplete="tel"
                      className={inputClassName}
                    />
                  </label>
                  <div className="flex items-end">
                    <button className="w-full rounded-md bg-black px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-neutral-800 sm:w-auto">
                      Save changes
                    </button>
                  </div>
                </form>
                {profileMessage ? (
                  <p role="status" className="mt-4 text-sm text-black">{profileMessage}</p>
                ) : null}
              </section>

              <section id="addresses-desktop" className={`${cardClassName} scroll-mt-28`}>
                <SectionHeading
                  icon={MapPin}
                  title="Delivery addresses"
                  description="Manage where your orders should be delivered."
                />

                {addresses.length > 0 ? (
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    {addresses.map((address) => (
                      <article key={address.id} className="rounded-md border border-gray-200 bg-gray-50/70 p-4 text-xs leading-5 text-gray-600">
                        <p className="font-semibold text-gray-950">{address.fullName}</p>
                        <p className="mt-1.5">
                          {address.addressLine1}
                          {address.addressLine2 ? `, ${address.addressLine2}` : ""}
                          <br />
                          {address.city}, {address.province} {address.postalCode}
                          <br />
                          {address.country}
                          {address.phone ? ` · ${address.phone}` : ""}
                        </p>
                        <div className="mt-3 flex gap-2">
                          <button
                            type="button"
                            onClick={() => editAddress(address)}
                            className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 font-medium text-gray-700 transition hover:border-black/30 hover:text-black"
                          >
                            <Pencil aria-hidden="true" className="h-3 w-3" />
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteAddress(address.id)}
                            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-medium text-red-700 transition hover:bg-red-50"
                          >
                            <Trash2 aria-hidden="true" className="h-3 w-3" />
                            Delete
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="mt-5 rounded-md border border-dashed border-gray-200 px-4 py-5 text-center text-xs text-gray-500">
                    No delivery address saved yet.
                  </p>
                )}

                <form onSubmit={saveAddress} className="mt-6 grid gap-x-4 gap-y-3 sm:grid-cols-2">
                  {addressFields.map((field) => (
                    <label key={field.name} className="text-xs font-medium text-gray-700">
                      {field.label}
                      {field.optional ? <span className="font-normal text-gray-400"> (optional)</span> : null}
                      <input
                        required={!field.optional}
                        value={addressForm[field.name]}
                        onChange={(event) =>
                          setAddressForm({ ...addressForm, [field.name]: event.target.value })
                        }
                        autoComplete={field.autoComplete}
                        className={inputClassName}
                      />
                    </label>
                  ))}
                  <div className="flex flex-wrap gap-3 pt-2 sm:col-span-2">
                    <button className="rounded-md bg-black px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-neutral-800">
                      {editingId ? "Update address" : "Add address"}
                    </button>
                    {editingId ? (
                      <button
                        type="button"
                        onClick={cancelAddress}
                        className="rounded-md border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 transition hover:border-gray-300"
                      >
                        Cancel
                      </button>
                    ) : null}
                  </div>
                </form>
                {addressMessage ? (
                  <p role="status" className="mt-4 text-sm text-black">{addressMessage}</p>
                ) : null}
              </section>
            </div>

            <div className="hidden items-start gap-5 lg:grid xl:grid-cols-[minmax(0,1.65fr)_minmax(280px,0.85fr)]">
              <section id="orders-desktop" className={`${cardClassName} scroll-mt-28`}>
                <SectionHeading
                  icon={Package}
                  title="Order history"
                  description="Track your past orders and their current status."
                />
                {orders.length === 0 ? (
                  <p className="mt-6 rounded-md border border-dashed border-gray-200 px-5 py-10 text-center text-sm text-gray-500">
                    Your orders will appear here after your first purchase.
                  </p>
                ) : (
                  <>
                    <div className="mt-6 hidden overflow-hidden sm:block">
                      <table className="w-full border-collapse text-left text-xs">
                        <thead>
                          <tr className="border-b border-gray-200 text-[10px] uppercase tracking-[0.12em] text-gray-500">
                            <th className="pb-3 pr-4 font-semibold">Order number</th>
                            <th className="pb-3 pr-4 font-semibold">Date</th>
                            <th className="pb-3 pr-4 font-semibold">Status</th>
                            <th className="pb-3 pr-4 text-right font-semibold">Total</th>
                            <th className="pb-3 text-right font-semibold">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {orders.map((order) => (
                            <tr key={order.id} className="border-b border-gray-100 last:border-0">
                              <td className="py-3 pr-4 font-medium text-gray-950">
                                <Link href={`/account/orders/${encodeURIComponent(order.id)}`} className="underline decoration-gray-300 underline-offset-4 hover:decoration-black">
                                  {order.orderNumber}
                                </Link>
                              </td>
                              <td className="py-3 pr-4 whitespace-nowrap text-gray-500">
                                {orderDateFormatter.format(new Date(order.createdAt))}
                              </td>
                              <td className="py-3 pr-4">
                                <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold ring-1 ring-inset ${statusClassName(order.status)}`}>
                                  {readableStatus(order.status, order.fulfilmentType)}
                                </span>
                              </td>
                              <td className="py-3 pr-4 text-right font-medium text-gray-950">R {order.total}</td>
                              <td className="py-3 text-right">
                                <Link href={`/account/orders/${encodeURIComponent(order.id)}`} className="font-semibold text-black underline decoration-gray-300 underline-offset-4 hover:decoration-black">
                                  View
                                </Link>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="mt-5 space-y-3 sm:hidden">
                      {orders.map((order) => (
                        <article key={order.id} className="rounded-md border border-gray-200 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-gray-950">{order.orderNumber}</p>
                              <p className="mt-1 text-xs text-gray-500">
                                {orderDateFormatter.format(new Date(order.createdAt))}
                              </p>
                            </div>
                            <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold ring-1 ring-inset ${statusClassName(order.status)}`}>
                              {readableStatus(order.status, order.fulfilmentType)}
                            </span>
                          </div>
                          <div className="mt-4 flex items-center justify-between gap-3 border-t border-gray-100 pt-3">
                            <p className="text-sm font-semibold text-gray-950">R {order.total}</p>
                            <Link href={`/account/orders/${encodeURIComponent(order.id)}`} className="text-xs font-semibold text-black underline decoration-gray-300 underline-offset-4">View details</Link>
                          </div>
                        </article>
                      ))}
                    </div>
                  </>
                )}
              </section>

              <section id="security-desktop" className={`${cardClassName} scroll-mt-28`}>
                <SectionHeading
                  icon={LockKeyhole}
                  title="Account security"
                  description="Keep your account secure."
                />
                <form onSubmit={changePassword} className="mt-6">
                  <label className="text-xs font-medium text-gray-700">
                    New password
                    <span className="relative mt-2 block">
                      <input
                        type={showPassword ? "text" : "password"}
                        minLength={6}
                        required
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder="Enter new password"
                        autoComplete="new-password"
                        className="w-full rounded-md border border-gray-200 bg-white px-3.5 py-2.5 pr-11 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-black focus:ring-2 focus:ring-black/10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((visible) => !visible)}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-gray-400 transition hover:text-gray-700"
                      >
                        {showPassword ? (
                          <EyeOff aria-hidden="true" className="h-4 w-4" />
                        ) : (
                          <Eye aria-hidden="true" className="h-4 w-4" />
                        )}
                      </button>
                    </span>
                  </label>
                  <button className="mt-4 w-full rounded-md bg-black px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-neutral-800">
                    Update password
                  </button>
                </form>
                {passwordMessage ? (
                  <p role="status" className="mt-4 text-sm text-black">{passwordMessage}</p>
                ) : null}
                <div className="mt-6 flex gap-3 border-t border-gray-100 pt-5 text-xs leading-5 text-gray-500">
                  <ShieldCheck aria-hidden="true" className="mt-0.5 h-4.5 w-4.5 shrink-0 text-black" strokeWidth={1.7} />
                  <p>Your account details are protected through your secure sign-in.</p>
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
