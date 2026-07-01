import { useState, useEffect } from "react";
import { api, ApiError } from "@/lib/api";

export interface Flight {
  id: string;
  flight_number: string;
  origin: string;
  destination: string;
  status: string;
}

export function useCrewFlights(accessToken: string | null) {
  const [flights, setFlights] = useState<Flight[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) {
      setFlights([]);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    api.get<{ data: Flight[] }>("/api/v1/flights", accessToken)
      .then((res) => {
        if (active) {
          setFlights(res.data || []);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          if (err instanceof ApiError) {
            setError(err.detail);
          } else {
            setError(err instanceof Error ? err.message : "An error occurred");
          }
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [accessToken]);

  return { flights, loading, error };
}
