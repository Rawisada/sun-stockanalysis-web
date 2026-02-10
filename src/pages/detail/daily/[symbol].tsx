import Head from "next/head";
import Navbar from "@/components/Navbar";
import Typography from "@mui/material/Typography";
import { useEffect, useMemo, useRef, useState } from "react";
import { fetchJson } from "@/lib/api";
import Stack from "@mui/material/Stack";
import { LineChart } from "@mui/x-charts/LineChart";
import IconButton from "@mui/material/IconButton";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { useRouter } from "next/router";
import Box from "@mui/material/Box";

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

const isActiveWindow = (date: Date) => {
  const hour = date.getHours();
  return hour >= 20 || hour < 4;
};

const msUntilNextWindowStart = (now: Date) => {
  const next = new Date(now);
  if (now.getHours() < 20) {
    next.setHours(20, 0, 0, 0);
  } else {
    next.setDate(now.getDate() + 1);
    next.setHours(20, 0, 0, 0);
  }
  return next.getTime() - now.getTime();
};

type AlertPayload = {
  message?: string;
  event?: {
    id?: string;
    symbol?: string;
    trend_ema_20?: number;
    trend_tanh_ema?: number;
    score_ema?: number;
    score_p_cross_ema?: number;
    created_at?: string;
  };
  [key: string]: unknown;
};

export default function StockDetailDailyPage() {
  const router = useRouter();
  const symbol = Array.isArray(router.query.symbol)
    ? router.query.symbol[0]
    : router.query.symbol;
  const [quotes, setQuotes] = useState<StockQuote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<AlertPayload[]>([]);
  const chartScrollRef = useRef<HTMLDivElement | null>(null);
  const hasInitialScroll = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let isActive = true;
    let attempts = 0;

    const connect = () => {
      if (!isActive) return;

      ws = new WebSocket("ws://localhost:8080/api/alerts/ws");

      ws.onopen = () => {
        attempts = 0;
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as AlertPayload | string;
          if (typeof data === "string") {
            setAlerts((prev) => [{ message: data }, ...prev].slice(0, 5));
          } else {
            setAlerts((prev) => [data, ...prev].slice(0, 5));
          }
        } catch {
          setAlerts((prev) => [
            { message: String(event.data) },
            ...prev,
          ].slice(0, 5));
        }
      };

      ws.onclose = () => {
        if (!isActive) return;
        const delay = Math.min(30000, 1000 * 2 ** attempts);
        attempts += 1;
        reconnectTimer = setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      isActive = false;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      ws?.close();
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

      const now = new Date();
      if (isActiveWindow(now)) {
        timer = setTimeout(loadQuotes, 60000);
      } else {
        timer = setTimeout(loadQuotes, msUntilNextWindowStart(now));
      }
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
      timeLabel: quote.created_at,
      price: quote.price_current,
      ema20: quote.ema_20,
      ema100: quote.ema_100,
      changePercent: quote.change_percent,
      changePrice: quote.change_price,
    }));
  }, [quotes]);

  const xAxisLabelMap = useMemo(() => {
    const map: Record<string, string> = {};
    let lastDate = "";
    chartData.forEach((item) => {
      const [datePart, timePart] = item.timeLabel.split(" ");
      const timeOnly = timePart?.slice(0, 5) ?? "";
      if (datePart && timeOnly) {
        if (datePart !== lastDate) {
          map[item.timeLabel] = `${datePart}\n${timeOnly}`;
          lastDate = datePart;
        } else {
          map[item.timeLabel] = timeOnly;
        }
      } else {
        map[item.timeLabel] = item.timeLabel;
      }
    });
    return map;
  }, [chartData]);

  useEffect(() => {
    const container = chartScrollRef.current;
    if (!container) return;
    if (!hasInitialScroll.current) {
      hasInitialScroll.current = true;
      return;
    }
    container.scrollLeft = container.scrollWidth;
  }, [chartData.length]);

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
          <Stack
            direction="row"
            spacing={3}
            alignItems="flex-start"
            sx={{ width: "100%", justifyContent: "space-between" }}
          >
            <Stack spacing={1} sx={{ flex: 1 }}>
              <Typography>Symbol: {symbol ?? "-"}</Typography>
              <Stack direction="row" spacing={2} alignItems="center">
                <Typography variant="body2">
                  Latest Change Percent:{" "}
                  <strong>
                    {chartData.length > 0
                      ? `${chartData[chartData.length - 1].changePercent.toFixed(
                          2
                        )}%`
                      : "-"}
                  </strong>
                </Typography>
                <Typography variant="body2">
                  Latest Change Price:{" "}
                  <strong>
                    {chartData.length > 0
                      ? `${chartData[chartData.length - 1].changePrice} USD`
                      : "-"}
                  </strong>
                </Typography>
              </Stack>
            </Stack>
            <Box
              sx={{
                minWidth: 260,
                border: "1px solid",
                borderColor: "divider",
                borderRadius: 1,
                padding: 1.5,
                bgcolor: "background.paper",
              }}
            >
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                {alerts[0]?.message ?? "Stable"}
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  mt: 0.5,
                  color:
                    alerts[0]?.event?.score_ema != null
                      ? alerts[0].event.score_ema > 0
                        ? "success.main"
                        : alerts[0].event.score_ema < 0
                        ? "error.main"
                        : "text.primary"
                      : "text.primary",
                }}
              >
                score ema: {alerts[0]?.event?.score_ema ?? "-"} (
                {alerts[0]?.event?.trend_ema_20 ?? "-"},{" "}
                {alerts[0]?.event?.trend_tanh_ema ?? "-"})
              </Typography>
              <Typography variant="body2">
                score price cross ema:{" "}
                {alerts[0]?.event?.score_p_cross_ema ?? "-"}
              </Typography>
            </Box>
          </Stack>
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
                  height: "330px",
                  padding: "0",
                  boxSizing: "border-box",
                  color: "#4b5563",
                  fontSize: "12px",
                }}
              >
                {yTicks.map((tick) => (
                  <div key={tick}>{tick.toFixed(2)}</div>
                ))}
              </div>
              <div
                ref={chartScrollRef}
                style={{ width: "100%", overflowX: "auto" }}
              >
                <LineChart
                  height={360}
                  width={Math.max(1200, chartData.length * 18)}
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
                      data: chartData.map((item) => item.timeLabel),
                      scaleType: "band",
                      label: "Time (minute)",
                      valueFormatter: (value) => {
                        if (typeof value !== "string") return String(value);
                        return xAxisLabelMap[value] ?? value;
                      },
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
