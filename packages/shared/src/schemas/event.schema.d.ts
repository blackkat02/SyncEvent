import * as yup from 'yup';
export declare enum EventVisibility {
    PUBLIC = "PUBLIC",
    PRIVATE = "PRIVATE"
}
export declare const createEventSchema: yup.ObjectSchema<{
    title: string;
    description: string | undefined;
    date: Date;
    location: string;
    capacity: number | null | undefined;
    visibility: NonNullable<EventVisibility | undefined>;
}, yup.AnyObject, {
    title: undefined;
    description: undefined;
    date: undefined;
    location: undefined;
    capacity: undefined;
    visibility: undefined;
}, "">;
export declare const updateEventSchema: yup.ObjectSchema<Partial<{
    title: string;
    description: string | undefined;
    date: Date;
    location: string;
    capacity: number | null | undefined;
    visibility: NonNullable<EventVisibility | undefined>;
}>, yup.AnyObject, {
    title: undefined;
    description: undefined;
    date: undefined;
    location: undefined;
    capacity: undefined;
    visibility: undefined;
}, "">;
export type CreateEventInput = yup.InferType<typeof createEventSchema>;
export type UpdateEventInput = yup.InferType<typeof updateEventSchema>;
//# sourceMappingURL=event.schema.d.ts.map