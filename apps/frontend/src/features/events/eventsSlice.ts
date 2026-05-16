import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { EventResponse } from '@syncevent/shared';
import { $api } from '../../api/axios';

interface EventsState {
  list: EventResponse[];
  loading: boolean;
  error: string | null;
}

const initialState: EventsState = {
  list: [],
  loading: false,
  error: null,
};

// Асинхронний запит до твого NestJS бекенду
export const fetchEvents = createAsyncThunk('events/fetchAll', async () => {
  const { data } = await $api.get<{ data: EventResponse[] }>('/events');
  return data.data;
});

const eventsSlice = createSlice({
  name: 'events',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchEvents.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchEvents.fulfilled, (state, action) => {
        state.loading = false;
        state.list = action.payload;
      })
      .addCase(fetchEvents.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to fetch events';
      });
  },
});

export default eventsSlice.reducer;