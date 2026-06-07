import * as yup from "yup";

export const EventVisibility = {
  PUBLIC: "PUBLIC",
  PRIVATE: "PRIVATE",
} as const;

export const createEventSchema = yup.object({
  title: yup.string().required("Title is required").min(2, "Too short"),
  description: yup.string().optional().nullable(),
  location: yup.string().required("Location is required"),
  capacity: yup
    .number()
    .transform((value: any) =>
      Number.isNaN(Number(value)) || value === "" ? null : Number(value),
    )
    .positive("Capacity must be positive")
    .integer("Capacity must be an integer")
    .nullable()
    .optional(),
  visibility: yup
    .mixed<EventVisibility>()
    .oneOf(Object.values(EventVisibility))
    .required(),

  dateStr: yup.string().required("Date is required"),
  timeStr: yup.string().required("Time is required"),
  date: yup.mixed().optional(),
});

export const updateEventSchema = createEventSchema.clone();

export type CreateEventInput = yup.InferType<typeof createEventSchema>;
export type UpdateEventInput = yup.InferType<typeof updateEventSchema>;
export type EventVisibility =
  (typeof EventVisibility)[keyof typeof EventVisibility];
