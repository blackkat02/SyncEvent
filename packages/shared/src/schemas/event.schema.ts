import { z } from "zod";

export const EventVisibility = {
  PUBLIC: "PUBLIC",
  PRIVATE: "PRIVATE",
} as const;

export const createEventSchema = z.object({
  title: z.string("Title is required").min(2, "Too short"),
  description: z.string().optional().nullable(),
  location: z.string("Location is required").min(1, "Location is required"),
  capacity: z.preprocess(
    (value) =>
      value === "" || Number.isNaN(Number(value)) ? null : Number(value),
    z
      .number()
      .positive("Capacity must be positive")
      .int("Capacity must be an integer")
      .nullable()
      .optional(),
  ),
  visibility: z.nativeEnum(EventVisibility),

  dateStr: z.string("Date is required").min(1, "Date is required"),
  timeStr: z.string("Time is required").min(1, "Time is required"),
  date: z.unknown().optional(),
});

export const updateEventSchema = createEventSchema;

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
export type EventVisibility =
  (typeof EventVisibility)[keyof typeof EventVisibility];
