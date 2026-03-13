export const CalendarHeader = () => (
  <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-8">
    <div className="flex items-center gap-4">
      <h2 className="text-2xl font-bold text-gray-900">
        October 2025 [cite: 155, 205]
      </h2>
      <div className="flex border rounded-lg overflow-hidden">
        <button className="p-2 hover:bg-gray-100 border-r">{"<"}</button>
        <button className="p-2 hover:bg-gray-100">{">"}</button>
      </div>
    </div>
    <div className="flex bg-gray-100 p-1 rounded-xl w-full md:w-auto">
      <button className="flex-1 md:px-6 py-2 bg-white shadow-sm rounded-lg text-sm font-bold text-blue-600">
        Month [cite: 164, 225]
      </button>
      <button className="flex-1 md:px-6 py-2 text-sm font-bold text-gray-500">
        Week [cite: 165, 226]
      </button>
    </div>
  </div>
);
