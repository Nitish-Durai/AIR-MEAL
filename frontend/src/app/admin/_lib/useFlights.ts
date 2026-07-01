import { useEffect, useState, useCallback } from "react";
import { api, ApiError } from "@/lib/api";

export interface Flight {
  id: string;
  flight_number: string;
  airline_id: string;
  origin: string;
  destination: string;
  dep_time: string;
  arr_time: string;
  aircraft_type: string | null;
  load_factor: number | null;
  status: string;
}

export function useFlights(accessToken: string | null) {
  const [flights, setFlights] = useState<Flight[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFlights = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get<{ data: Flight[] }>("/api/v1/flights", accessToken || undefined);
      setFlights(response.data || []);
    } catch (err) {
      console.error("Failed to fetch flights:", err);
      if (err instanceof ApiError) {
        setError(err.detail || "Failed to fetch flights");
      } else {
        setError("Failed to fetch flights");
      }
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    fetchFlights();
  }, [fetchFlights]);

  return { flights, loading, error, refetch: fetchFlights };
}
