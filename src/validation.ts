import { z } from "zod";

export const listingInput = z.object({
  transactionType: z.enum(["buy", "sell", "rent"]),
  title: z.string().trim().min(5).max(120),
  description: z.string().trim().min(20).max(5000),
  price: z.coerce.number().positive(),
  currency: z.string().trim().min(1).max(8),
  city: z.enum(["Yangon", "Mandalay", "Bago"]),
  address: z.string().trim().min(5).max(240),
  propertyType: z.string().trim().min(2).max(60),
  bedrooms: z.coerce.number().int().min(0).max(50),
  bathrooms: z.coerce.number().int().min(0).max(50),
  area: z.coerce.number().positive(),
  areaUnit: z.string().trim().min(1).max(20),
  contactPreference: z.enum(["phone", "email", "both"])
});

export const photoInput = z.object({
  altText: z.string().trim().max(200).optional(),
  sortOrder: z.coerce.number().int().min(0).optional()
});

export function errorFields(error: z.ZodError) {
  return Object.fromEntries(error.issues.map((issue) => [issue.path.join(".") || "form", issue.message]));
}
