import { EventCard } from "../features/events/components/EventCard";

export const EventsPage = () => {
  return (
    <div className="space-y-8">
      <section className="text-center md:text-left py-4">
        <h2 className="text-3xl font-extrabold text-gray-900 mb-2">
          Discover Events [cite: 122]
        </h2>
        <p className="text-gray-500 text-lg">
          Find and join exciting events happening around you [cite: 123]
        </p>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <EventCard
          title="Tech Conference 2025"
          description="Annual technology conference featuring the latest innovations in AI and machine learning"
          date="Nov 15, 2025"
          time="09:00"
          location="Convention Center, San Francisco"
          participants={0}
          capacity={500}
        />
        {/* Додаємо ще картки для тесту верстки */}
      </div>
    </div>
  );
};
