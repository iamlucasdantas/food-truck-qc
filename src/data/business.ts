/** Pure rules for "business info is asked once per owner" (shared by forms, server and tests). */

export const CONTACT_FIELDS = ["contactName", "email", "phone"] as const;
export const BUSINESS_FIELDS = ["businessName", "description", "website", "instagram", "facebook"] as const;
export const TRUCK_FIELDS = ["truckName", "truckType", "category", "city"] as const;

/** Steps of the owner signup. A business that already exists gets no business fields. */
export function signupStepsFor(hasBusiness: boolean): string[][] {
  return hasBusiness
    ? [[...CONTACT_FIELDS], [...TRUCK_FIELDS]]
    : [[...CONTACT_FIELDS, ...BUSINESS_FIELDS], [...TRUCK_FIELDS]];
}

/** Account owner form: a second truck is a single truck-only step. */
export function ownerFormSteps(hasBusiness: boolean): string[][] {
  return hasBusiness ? [[...TRUCK_FIELDS]] : signupStepsFor(false);
}

export interface OwnerContact { name: string; email: string; phone: string }

export function contactLine(c: OwnerContact) {
  return `Owner contact: ${[c.name, c.email, c.phone].filter(Boolean).join(" · ")}`;
}

/** Parse the "Owner contact: name · email · phone" line stored on embed trucks. */
export function parseContact(description: string | null | undefined): OwnerContact | null {
  const m = (description ?? "").match(/Owner contact:\s*([^·\n]+?)\s*(?:·\s*([^\s·]+@[^\s·]+))?\s*(?:·\s*([^\n]+))?$/m);
  if (!m) return null;
  return { name: (m[1] ?? "").trim(), email: (m[2] ?? "").trim(), phone: (m[3] ?? "").trim() };
}

export function parseBusinessName(description: string | null | undefined) {
  return ((description ?? "").match(/Business:\s*([^\n]+)/)?.[1] ?? "").trim();
}

export interface ExistingBusiness {
  ownerId: string | null;
  businessName: string;
  contact: OwnerContact;
  website: string | null;
  instagram: string | null;
  facebook: string | null;
  truckNames: string[];
}

export interface SignupInput {
  contactName: string; email: string; phone: string; businessName: string; description: string;
  website: string; instagram: string; facebook: string;
  truckName: string; truckType: string; category: string; city: string;
}

export const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Build the truck row + webhook identity for a signup. When the email already has a business,
 * the new truck links to it: same owner contact and business name, inherited links, business fields ignored.
 */
export function buildSignup(d: SignupInput, existing: ExistingBusiness | null) {
  if (existing && existing.truckNames.some((n) => sameName(n, d.truckName))) {
    return { ok: false as const, field: "truckName", error: "This business already has a truck with that name — pick a unique one." };
  }
  const contact: OwnerContact = existing
    ? { name: existing.contact.name || d.contactName.trim(), email: d.email.trim(), phone: existing.contact.phone || d.phone.trim() }
    : { name: d.contactName.trim(), email: d.email.trim(), phone: d.phone.trim() };
  const businessName = existing ? existing.businessName : d.businessName.trim();
  const description = existing ? "" : d.description.trim();
  return {
    ok: true as const,
    linked: !!existing,
    contact,
    businessName,
    truck: {
      name: d.truckName.trim(),
      category: d.category.trim(),
      truck_type: d.truckType,
      base_address: d.city.trim() || null,
      phone: contact.phone || null,
      created_by: existing?.ownerId ?? null,
      website: existing ? existing.website : d.website.trim() || null,
      instagram: existing ? existing.instagram : d.instagram.trim() || null,
      facebook: existing ? existing.facebook : d.facebook.trim() || null,
      description: [description, businessName && `Business: ${businessName}`, contactLine(contact)].filter(Boolean).join("\n\n"),
    },
  };
}
