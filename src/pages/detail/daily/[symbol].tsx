import Head from "next/head";
import Navbar from "@/components/Navbar";
import Typography from "@mui/material/Typography";
import { useEffect, useMemo, useState } from "react";
import { fetchJson } from "@/lib/api";
import Stack from "@mui/material/Stack";
import { LineChart } from "@mui/x-charts/LineChart";
import IconButton from "@mui/material/IconButton";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { useRouter } from "next/router";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";

type StockQuote = {
  id: string;
  symbol: string;
  price_current: number;
  change_price: number;
  change_percent: number;
  ema_20: number;
  ema_100: number;
  tanh_ema: number;
  change_ema_20: number;
  change_tanh_ema: number;
  ema_trend: number;
  created_at: string;
};

type StockQuoteResponse = {
  status?: {
    code?: string;
    message?: string;
  };
  data?: StockQuote[];
};

const parseDateTime = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(" ", "T");
  return new Date(normalized);
};

export default function StockDetailDailyPage() {
  const router = useRouter();
  const symbol = Array.isArray(router.query.symbol)
    ? router.query.symbol[0]
    : router.query.symbol;
  const [quotes, setQuotes] = useState<StockQuote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<string[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const ws = new WebSocket("ws://localhost:8080/api/alerts/ws");

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const text =
          typeof data === "string" ? data : JSON.stringify(data, null, 2);
        setAlerts((prev) => [text, ...prev].slice(0, 5));
      } catch {
        setAlerts((prev) => [String(event.data), ...prev].slice(0, 5));
      }
    };

    return () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    if (!symbol) return;

    let isMounted = true;
    let timer: NodeJS.Timeout | null = null;

    const loadQuotes = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const query = new URLSearchParams({ symbol }).toString();
        const data = await fetchJson<StockQuoteResponse>(
          `/v1/stock-quotes?${query}`,
          {
            method: "GET",
          }
        );
        if (isMounted) {
          setQuotes(data.data ?? []);
        }
      } catch (err) {
        if (isMounted) {
          const message = err instanceof Error ? err.message : "Load failed";
          setError(message);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }

      timer = setTimeout(loadQuotes, 60000);
    };

    loadQuotes();
    return () => {
      isMounted = false;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [symbol]);

  const chartData = useMemo(() => {
    const sorted = [...quotes].sort((a, b) => {
      const timeA = parseDateTime(a.created_at)?.getTime() ?? 0;
      const timeB = parseDateTime(b.created_at)?.getTime() ?? 0;
      return timeA - timeB;
    });

    return sorted.map((quote) => ({
      time: parseDateTime(quote.created_at),
      price: quote.price_current,
      ema20: quote.ema_20,
      ema100: quote.ema_100,
    }));
  }, [quotes]);

  const yTicks = useMemo(() => {
    if (chartData.length === 0) return [];
    const values = chartData.flatMap((item) => [
      item.price,
      item.ema20,
      item.ema100,
    ]);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const steps = 5;
    const stepSize = (max - min) / (steps - 1 || 1);
    return Array.from({ length: steps }, (_, index) => {
      const value = max - stepSize * index;
      return Number.isFinite(value) ? value : max;
    });
  }, [chartData]);

  return (
    <>
      <Head>
        <title>Daily Detail</title>
      </Head>
      <Navbar />
      <main style={{ padding: "24px" }}>
        <Stack spacing={2}>
          <Stack direction="row" spacing={1} alignItems="center">
            <IconButton
              aria-label="Back"
              onClick={() => router.back()}
              size="small"
            >
              <ArrowBackIcon />
            </IconButton>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              Daily Detail
            </Typography>
          </Stack>
          <Typography>Symbol: {symbol ?? "-"}</Typography>
          {alerts.length > 0 ? (
            <Alert severity="warning">
              <AlertTitle>Alerts</AlertTitle>
              {alerts.map((item, index) => (
                <Typography
                  key={`${item}-${index}`}
                  component="div"
                  sx={{ fontFamily: "monospace", fontSize: 12 }}
                >
                  {item}
                </Typography>
              ))}
            </Alert>
          ) : null}
          {isLoading ? <Typography>Loading...</Typography> : null}
          {error ? <Typography color="error">{error}</Typography> : null}
          {!isLoading && !error && chartData.length > 0 ? (
            <div style={{ display: "flex", gap: "12px" }}>
              <div
                style={{
                  width: "64px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  padding: "8px 0 28px",
                  color: "#4b5563",
                  fontSize: "12px",
                }}
              >
                {yTicks.map((tick) => (
                  <div key={tick}>{tick.toFixed(2)}</div>
                ))}
              </div>
              <div style={{ width: "100%", overflowX: "auto" }}>
                <LineChart
                  height={360}
                  width={Math.max(800, chartData.length * 14)}
                  series={[
                    {
                      data: chartData.map((item) => item.price),
                      label: "Price",
                      color: "#2563eb",
                      showMark: false,
                    },
                    {
                      data: chartData.map((item) => item.ema20),
                      label: "EMA 20",
                      color: "#f59e0b",
                      showMark: false,
                    },
                    {
                      data: chartData.map((item) => item.ema100),
                      label: "EMA 100",
                      color: "#16a34a",
                      showMark: false,
                    },
                  ]}
                  xAxis={[
                    {
                      data: chartData.map((item) => item.time as Date),
                      scaleType: "time",
                      label: "Time (minute)",
                      valueFormatter: (value: Date) =>
                        value.toLocaleTimeString("th-TH", {
                          hour: "2-digit",
                          minute: "2-digit",
                        }),
                      tickInterval: "minute",
                    },
                  ]}
                  yAxis={[
                    {
                      tickLabelStyle: { display: "none" },
                      disableLine: true,
                      disableTicks: true,
                    },
                  ]}
                />
              </div>
            </div>
          ) : null}
          {!isLoading && !error && chartData.length === 0 ? (
            <Typography>No data available.</Typography>
          ) : null}
        </Stack>
      </main>
    </>
  );
}
