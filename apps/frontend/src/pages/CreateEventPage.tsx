export const CreateEventPage = () => {
  return (
    <div className="max-w-2xl mx-auto bg-white p-8 rounded-2xl border shadow-sm">
      <h2 className="text-2xl font-extrabold mb-2">Create New Event</h2>
      <p className="text-gray-500 mb-8">
        Fill in the details to create an amazing event
      </p>

      <form className="space-y-6">
        <div className="space-y-2">
          <label className="text-sm font-bold text-gray-700">
            Event Title *
          </label>
          <input
            className="w-full p-3 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
            placeholder="e.g., Tech Conference 2025 [cite: 236]"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-bold text-gray-700">Date *</label>
            <input type="date" className="w-full p-3 border rounded-xl" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-bold text-gray-700">
              Time * [cite: 241]
            </label>
            <input type="time" className="w-full p-3 border rounded-xl" />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-bold text-gray-700">Visibility</label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="visibility"
                checked
                className="w-4 h-4 text-blue-600"
              />
              <span className="text-sm">Public</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="visibility"
                className="w-4 h-4 text-blue-600"
              />
              <span className="text-sm">Private</span>
            </label>
          </div>
        </div>

        <div className="flex gap-4 pt-4">
          <button
            type="button"
            className="flex-1 py-3 border rounded-xl font-bold hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition"
          >
            Create Event
          </button>
        </div>
      </form>
    </div>
  );
};
