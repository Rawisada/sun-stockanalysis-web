import Head from "next/head";
import Navbar from "@/components/Navbar";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import IconButton from "@mui/material/IconButton";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { fetchJson } from "@/lib/api";
import Accordion from "@mui/material/Accordion";
import AccordionSummary from "@mui/material/AccordionSummary";
import AccordionDetails from "@mui/material/AccordionDetails";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import Link from "@mui/material/Link";

type CompanyNews = {
  id: string;
  symbol: string;
  headline: string;
  source: string;
  summary: string;
  url: string;
  created_at: string;
  updated_at: string;
};

type CompanyNewsResponse = {
  status?: {
    code?: string;
    message?: string;
  };
  data?: CompanyNews[];
};

const formatDateLocal = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export default function StockDetailNewsPage() {
  const router = useRouter();
  const symbol = Array.isArray(router.query.symbol)
    ? router.query.symbol[0]
    : router.query.symbol;
  const [news, setNews] = useState<CompanyNews[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const dateRange = useMemo(() => {
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    return {
      start: formatDateLocal(yesterday),
      end: formatDateLocal(today),
    };
  }, []);

  useEffect(() => {
    if (!symbol) return;

    let isMounted = true;
    const loadNews = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const query = new URLSearchParams({
          symbol,
          start: dateRange.start,
          end: dateRange.end,
        }).toString();
        const data = await fetchJson<CompanyNewsResponse>(
          `/v1/company-news?${query}`,
          { method: "GET" }
        );
        if (isMounted) {
          setNews(data.data ?? []);
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
    };

    loadNews();
    return () => {
      isMounted = false;
    };
  }, [symbol, dateRange.end, dateRange.start]);

  return (
    <>
      <Head>
        <title>News</title>
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
              News
            </Typography>
          </Stack>
          <Typography>Symbol: {symbol ?? "-"}</Typography>
          <Typography sx={{ color: "text.secondary" }}>
            Date range: {dateRange.start} to {dateRange.end}
          </Typography>
          {isLoading ? <Typography>Loading...</Typography> : null}
          {error ? <Typography color="error">{error}</Typography> : null}
          {!isLoading && !error && news.length === 0 ? (
            <Typography>No news found.</Typography>
          ) : null}
          {!isLoading && !error && news.length > 0 ? (
            <Stack spacing={1}>
              {news.map((item) => (
                <Accordion key={item.id} defaultExpanded={false}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography sx={{ fontWeight: 600 }}>
                      {item.headline}
                    </Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Typography>symbol: {item.symbol}</Typography>
                    <Typography sx={{ fontWeight: 700 }}>
                      summary: {item.summary}
                    </Typography>
                    <Typography sx={{ color: "text.secondary" }}>
                      source: {item.source}
                    </Typography>
                    <Typography sx={{ color: "text.secondary" }}>
                      url:{" "}
                      <Link href={item.url} target="_blank" rel="noreferrer">
                        {item.url}
                      </Link>
                    </Typography>
                    <Typography sx={{ color: "text.secondary" }}>
                      data: {item.created_at.split(" ")[0]}
                    </Typography>
                  </AccordionDetails>
                </Accordion>
              ))}
            </Stack>
          ) : null}
        </Stack>
      </main>
    </>
  );
}
