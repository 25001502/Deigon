"use client";

import { useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { LogoutButton } from "@/components/auth/logout-button";

type Profile = { name: string | null; email: string; phone: string | null; role: string };
type Address = { id: string; fullName: string; addressLine1: string; addressLine2: string | null; city: string; province: string; postalCode: string; country: string; phone: string | null };
type Order = { id: string; orderNumber: string; status: string; total: string; createdAt: Date };

type Props = { profile: Profile; addresses: Address[]; orders: Order[] };

const emptyAddress = { fullName: "", addressLine1: "", addressLine2: "", city: "", province: "", postalCode: "", country: "South Africa", phone: "" };

export function AccountDashboard({ profile: initialProfile, addresses: initialAddresses, orders }: Props) {
  const [profile, setProfile] = useState(initialProfile);
  const [addresses, setAddresses] = useState(initialAddresses);
  const [profileForm, setProfileForm] = useState({ name: initialProfile.name ?? "", phone: initialProfile.phone ?? "" });
  const [addressForm, setAddressForm] = useState(emptyAddress);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [profileMessage, setProfileMessage] = useState("");
  const [addressMessage, setAddressMessage] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [password, setPassword] = useState("");

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/account/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(profileForm) });
    const data = await response.json();
    setProfileMessage(data.ok ? "Profile saved." : data.message ?? "Could not save profile.");
    if (data.ok) setProfile(data.profile);
  }

  async function saveAddress(event: React.FormEvent) {
    event.preventDefault();
    const url = editingId ? `/api/account/addresses/${editingId}` : "/api/account/addresses";
    const response = await fetch(url, { method: editingId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(addressForm) });
    const data = await response.json();
    if (!data.ok) {
      setAddressMessage(data.message ?? "Could not save address.");
      return;
    }
    setAddresses((current) => editingId ? current.map((address) => address.id === editingId ? data.address : address) : [data.address, ...current]);
    setAddressForm(emptyAddress);
    setEditingId(null);
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
    if (!error) setPassword("");
  }

  return (
    <main className="bg-paper px-5 py-12 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-col justify-between gap-6 border-b border-ink/10 pb-8 sm:flex-row sm:items-end">
          <div><p className="text-xs font-semibold uppercase tracking-[0.24em] text-clay">Your Deigon</p><h1 className="mt-2 font-display text-5xl text-ink">Account</h1><p className="mt-3 text-sm text-ink/60">Manage your details, addresses, and orders.</p></div>
          <LogoutButton />
        </header>

        <div className="mt-8 grid gap-8 lg:grid-cols-[0.75fr_1.25fr]">
          <aside className="h-fit border border-ink/10 bg-white p-5"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-ink/50">Account menu</p><nav className="mt-4 grid gap-2 text-sm"><a href="#profile" className="border-l-2 border-clay px-3 py-2 text-ink">Profile</a><a href="#addresses" className="px-3 py-2 text-ink/65 hover:text-ink">Addresses</a><a href="#orders" className="px-3 py-2 text-ink/65 hover:text-ink">Orders</a><a href="#security" className="px-3 py-2 text-ink/65 hover:text-ink">Account Security</a></nav></aside>

          <div className="space-y-8">
            <section id="profile" className="border border-ink/10 bg-white p-6 sm:p-8"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-clay">Profile</p><h2 className="mt-2 text-2xl font-semibold text-ink">Personal details</h2></div><span className="text-xs uppercase tracking-wide text-ink/40">{profile.role}</span></div><form onSubmit={saveProfile} className="mt-6 grid gap-4 sm:grid-cols-2"><label className="text-sm text-ink">Name<input value={profileForm.name} onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })} className="mt-2 w-full rounded-xl border border-ink/15 px-4 py-3" /></label><label className="text-sm text-ink">Email<input value={profile.email} readOnly className="mt-2 w-full rounded-xl border border-ink/10 bg-ink/5 px-4 py-3 text-ink/55" /></label><label className="text-sm text-ink">Phone<input value={profileForm.phone} onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })} className="mt-2 w-full rounded-xl border border-ink/15 px-4 py-3" /></label><div className="flex items-end"><button className="rounded-xl bg-ink px-5 py-3 text-sm font-semibold text-white hover:bg-black">Save profile</button></div></form>{profileMessage ? <p className="mt-4 text-sm text-forest">{profileMessage}</p> : null}</section>

            <section id="addresses" className="border border-ink/10 bg-white p-6 sm:p-8"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-clay">Addresses</p><h2 className="mt-2 text-2xl font-semibold text-ink">Delivery details</h2><div className="mt-6 grid gap-4 sm:grid-cols-2">{addresses.map((address) => <article key={address.id} className="border border-ink/10 p-4 text-sm text-ink/70"><p className="font-semibold text-ink">{address.fullName}</p><p className="mt-2">{address.addressLine1}{address.addressLine2 ? `, ${address.addressLine2}` : ""}<br />{address.city}, {address.province} {address.postalCode}<br />{address.country}{address.phone ? ` · ${address.phone}` : ""}</p><div className="mt-4 flex gap-4 text-xs font-semibold uppercase tracking-wide"><button onClick={() => { setEditingId(address.id); setAddressForm({ fullName: address.fullName, addressLine1: address.addressLine1, addressLine2: address.addressLine2 ?? "", city: address.city, province: address.province, postalCode: address.postalCode, country: address.country, phone: address.phone ?? "" }); }} className="underline">Edit</button><button onClick={() => deleteAddress(address.id)} className="text-red-700 underline">Delete</button></div></article>)}</div><form onSubmit={saveAddress} className="mt-8 grid gap-3 sm:grid-cols-2">{Object.keys(addressForm).map((field) => <label key={field} className="text-sm capitalize text-ink">{field.replace(/([A-Z])/g, " $1")}<input required={!['addressLine2', 'phone'].includes(field)} value={addressForm[field as keyof typeof addressForm]} onChange={(e) => setAddressForm({ ...addressForm, [field]: e.target.value })} className="mt-2 w-full rounded-xl border border-ink/15 px-4 py-3" /></label>)}<div className="sm:col-span-2 flex gap-3"><button className="rounded-xl bg-ink px-5 py-3 text-sm font-semibold text-white">{editingId ? "Update address" : "Add address"}</button>{editingId ? <button type="button" onClick={() => { setEditingId(null); setAddressForm(emptyAddress); }} className="rounded-xl border border-ink/20 px-5 py-3 text-sm">Cancel</button> : null}</div></form>{addressMessage ? <p className="mt-4 text-sm text-forest">{addressMessage}</p> : null}</section>

            <section id="orders" className="border border-ink/10 bg-white p-6 sm:p-8"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-clay">Orders</p><h2 className="mt-2 text-2xl font-semibold text-ink">Order history</h2>{orders.length === 0 ? <p className="mt-6 border border-dashed border-ink/15 px-5 py-10 text-center text-sm text-ink/55">Your orders will appear here after your first purchase.</p> : <div className="mt-6 space-y-3">{orders.map((order) => <div key={order.id} className="flex justify-between border-b border-ink/10 py-3 text-sm"><span>{order.orderNumber}</span><span>{order.status}</span><span>R {order.total}</span></div>)}</div>}</section>

            <section id="security" className="border border-ink/10 bg-white p-6 sm:p-8"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-clay">Account security</p><h2 className="mt-2 text-2xl font-semibold text-ink">Change password</h2><form onSubmit={changePassword} className="mt-6 flex flex-col gap-3 sm:flex-row"><input type="password" minLength={6} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="New password" className="rounded-xl border border-ink/15 px-4 py-3" /><button className="rounded-xl bg-ink px-5 py-3 text-sm font-semibold text-white">Update password</button></form>{passwordMessage ? <p className="mt-4 text-sm text-forest">{passwordMessage}</p> : null}</section>
          </div>
        </div>
      </div>
    </main>
  );
}
