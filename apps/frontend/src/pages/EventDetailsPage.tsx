export const EventDetailsPage = () => {
  // Тимчасові дані для верстки
  const isOrganizer = true;

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="bg-white border border-gray-200 rounded-2xl p-6 md:p-10 shadow-sm">
        <div className="flex flex-col md:flex-row justify-between items-start gap-4 mb-6">
          <h2 className="text-3xl font-extrabold text-gray-900">
            Tech Conference 2026
          </h2>
          {isOrganizer && (
            <div className="flex gap-2 w-full md:w-auto">
              <button className="flex-1 md:flex-none px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50">
                Edit
              </button>
              <button className="flex-1 md:flex-none px-4 py-2 bg-red-50 text-red-600 rounded-lg text-sm font-medium hover:bg-red-100">
                Delete
              </button>
            </div>
          )}
        </div>

        <p className="text-gray-600 text-lg mb-8">
          Annual technology conference featuring the latest innovations in AI
          and machine learning. Join us for a day of networking and learning.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-8 border-b">
          <div className="space-y-1">
            <span className="text-sm text-gray-400 uppercase font-bold">
              Date & Time
            </span>
            <p className="text-gray-900 font-medium">Nov 15, 2026 at 09:00</p>
          </div>
          <div className="space-y-1">
            <span className="text-sm text-gray-400 uppercase font-bold">
              Location
            </span>
            <p className="text-gray-900 font-medium">
              Convention Center, San Francisco
            </p>
          </div>
        </div>

        <div className="pt-8">
          <h4 className="text-xl font-bold mb-4">Participants (2/500)</h4>
          <div className="flex flex-wrap gap-2">
            <div className="px-4 py-2 bg-blue-50 text-blue-700 rounded-full text-sm font-medium">
              Eduard (Organizer)
            </div>
            <div className="px-4 py-2 bg-gray-100 text-gray-700 rounded-full text-sm font-medium">
              Jane Participant
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
