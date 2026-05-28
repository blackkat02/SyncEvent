import { useForm } from "react-hook-form";
import type { Resolver, SubmitHandler } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import { useNavigate, useParams } from "react-router-dom";
import {
  useCreateEventMutation,
  useGetEventByIdQuery,
  useUpdateEventMutation,
} from "../features/events/eventsApi";
import { Calendar, Clock, MapPin, Users, Globe, ArrowLeft } from "lucide-react";
import { createEventSchema, EventVisibility } from "@syncevent/shared";
import type { CreateEventRequest, UpdateEventInput } from "@syncevent/shared";
import { useEffect } from "react";
import * as yup from "yup";

type EventFormState = yup.InferType<typeof createEventSchema>;

export const CreateEventPage = () => {
  const { id } = useParams<{ id: string }>();
  const isEditMode = Boolean(id);

  const navigate = useNavigate();
  const [createEvent, { isLoading: isCreating }] = useCreateEventMutation();
  const [updateEvent, { isLoading: isUpdating }] = useUpdateEventMutation();

  const { data: eventData, isLoading: isLoadingEvent } = useGetEventByIdQuery(
    id!,
    {
      skip: !isEditMode,
    },
  );

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<EventFormState>({
    resolver: yupResolver(createEventSchema) as Resolver<EventFormState>,
    defaultValues: {
      title: "",
      description: "",
      location: "",
      capacity: null,
      visibility: EventVisibility.PUBLIC,
      dateStr: "",
      timeStr: "",
      date: new Date(),
    },
  });

  // тимчасово для тестів
  useEffect(() => {
    if (Object.keys(errors).length > 0) {
      console.warn("⚠️ Валідація не пройшла:", errors);
    }
  }, [errors]);

  const onSubmit: SubmitHandler<EventFormState> = async (values) => {
    try {
      const combinedDate = new Date(`${values.dateStr}T${values.timeStr}`);

      if (isEditMode && id) {
        // 🔹 Логіка РЕДАГУВАННЯ: структура строго під ({ id, body })
        const body: UpdateEventInput = {
          title: values.title,
          location: values.location,
          visibility: values.visibility,
          description: values.description || null,
          capacity: values.capacity ? Number(values.capacity) : null,
          date: combinedDate.toISOString(),
          dateStr: values.dateStr,
          timeStr: values.timeStr,
        };

        // Викликаємо мутацію PATCH
        await updateEvent({ id, body }).unwrap();

        // 🚀 Повертаємо користувача на сторінку деталей, використовуючи id з useParams
        navigate(`/events/${id}`);
      } else {
        // 🔸 Логіка СТВОРЕННЯ: структура строго під CreateEventInput
        const payload: CreateEventRequest = {
          title: values.title,
          location: values.location,
          visibility: values.visibility as EventVisibility,
          description: values.description || null,
          capacity: values.capacity ? Number(values.capacity) : null,
          date: combinedDate.toISOString(),
        };

        await createEvent(payload as any).unwrap();
        navigate("/my-events");
      }
    } catch (error) {
      console.error("Failed to save event:", error);
    }
  };

  // const onSubmit: SubmitHandler<EventFormState> = async (values) => {
  //   try {
  //     const combinedDate = new Date(`${values.dateStr}T${values.timeStr}`);

  //     const payload: CreateEventRequest = {
  //       title: values.title,
  //       location: values.location,
  //       visibility: values.visibility as EventVisibility,
  //       description: values.description ?? null,
  //       capacity: values.capacity ? Number(values.capacity) : null,
  //       date: combinedDate.toISOString(),
  //     };

  //     await createEvent(payload as any).unwrap();
  //     navigate("/my-events");
  //   } catch (error) {
  //     console.error("Failed to create event:", error);
  //   }
  // };

  useEffect(() => {
    if (isEditMode && eventData) {
      const eventDate = new Date(eventData.date);
      const dateStr = eventDate.toISOString().split("T")[0];
      const timeStr = eventDate.toTimeString().split(" ")[0].substring(0, 5);

      reset({
        title: eventData.title,
        description: eventData.description,
        location: eventData.location,
        capacity: eventData.capacity,
        visibility: eventData.visibility,
        dateStr,
        timeStr,
        date: eventDate,
      });
    }
  }, [eventData, isEditMode, reset]);

  return (
    <div className="max-w-2xl mx-auto bg-white p-8 rounded-2xl border shadow-sm">
      <button
        type="button"
        onClick={() => navigate("/my-events")}
        className="inline-flex items-center gap-2 text-sm font-semibold text-gray-500 hover:text-gray-900 mb-6 transition-colors"
      >
        <ArrowLeft size={16} /> Back to Calendar
      </button>

      <h2 className="text-2xl font-extrabold mb-2">
        {isEditMode ? "Edit Event" : "Create New Event"}
      </h2>
      <p className="text-gray-500 mb-8">
        {isEditMode
          ? "Modify the details of your event"
          : "Fill in the details to create an amazing event"}
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="space-y-2">
          <label className="text-sm font-bold text-gray-700 block">
            Event Title *
          </label>
          <input
            {...register("title")}
            className={`w-full p-3 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all ${
              errors.title
                ? "border-red-500 focus:ring-red-500"
                : "border-gray-200"
            }`}
            placeholder="e.g., Tech Conference 2026"
          />
          {errors.title && (
            <p className="text-xs font-semibold text-red-500 mt-1">
              {errors.title.message}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-bold text-gray-700 flex items-center gap-1.5">
              <Calendar size={16} className="text-gray-400" /> Date *
            </label>
            <input
              type="date"
              {...register("dateStr")}
              className={`w-full p-3 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none ${
                errors.dateStr ? "border-red-500" : "border-gray-200"
              }`}
            />
            {errors.dateStr && (
              <p className="text-xs font-semibold text-red-500 mt-1">
                {errors.dateStr.message}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <label className="text-sm font-bold text-gray-700 flex items-center gap-1.5">
              <Clock size={16} className="text-gray-400" /> Time *
            </label>
            <input
              type="time"
              {...register("timeStr")}
              className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-bold text-gray-700 flex items-center gap-1.5">
            <MapPin size={16} className="text-gray-400" /> Location *
          </label>
          <input
            {...register("location")}
            className={`w-full p-3 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all ${
              errors.location
                ? "border-red-500 focus:ring-red-500"
                : "border-gray-200"
            }`}
            placeholder="e.g., Remote / Zoom or Kyiv Office"
          />
          {errors.location && (
            <p className="text-xs font-semibold text-red-500 mt-1">
              {errors.location.message}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-bold text-gray-700 flex items-center gap-1.5">
              <Users size={16} className="text-gray-400" /> Capacity (Optional)
            </label>
            <input
              type="number"
              {...register("capacity")}
              className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="e.g., 100"
            />
            {errors.capacity && (
              <p className="text-xs font-semibold text-red-500 mt-1">
                {errors.capacity.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-gray-700 flex items-center gap-1.5">
              <Globe size={16} className="text-gray-400" /> Visibility
            </label>
            <div className="flex gap-4 h-12.5 items-center border border-gray-200 rounded-xl px-4 bg-gray-50/50">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="radio"
                  value={EventVisibility.PUBLIC}
                  {...register("visibility")}
                  className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">
                  Public
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="radio"
                  value={EventVisibility.PRIVATE}
                  {...register("visibility")}
                  className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">
                  Private
                </span>
              </label>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-bold text-gray-700">Description</label>
          <textarea
            {...register("description")}
            rows={4}
            className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none resize-none"
            placeholder="Tell participants what this event is about..."
          />
        </div>

        <div className="flex gap-4 pt-4 border-t border-gray-100">
          <button
            type="button"
            onClick={() => navigate("/my-events")}
            className="flex-1 py-3 border border-gray-200 rounded-xl font-bold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isCreating || isUpdating}
            className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-sm disabled:bg-blue-400 disabled:cursor-not-allowed"
          >
            {isCreating || isUpdating
              ? "Saving..."
              : isEditMode
                ? "Update Event"
                : "Create Event"}
          </button>
        </div>
      </form>
    </div>
  );
};
