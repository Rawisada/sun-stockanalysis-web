import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import { useRouter } from "next/router";
import { clearCookie } from "@/lib/api";
import { useEffect, useState, type ChangeEvent } from "react";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import {
  hasPushSubscription,
  subscribeToPushNotifications,
  unsubscribeFromPushNotifications,
} from "@/lib/push";

type NavItem = {
  label: string;
  href: string;
};

const navItems: NavItem[] = [{ label: "Home", href: "/" }];

export default function Navbar() {
  const router = useRouter();
  const [isUpdatingPush, setIsUpdatingPush] = useState(false);
  const [isPushEnabled, setIsPushEnabled] = useState(false);
  const [pushStatus, setPushStatus] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const loadPushStatus = async () => {
      try {
        const enabled = await hasPushSubscription();
        if (isMounted) {
          setIsPushEnabled(enabled);
        }
      } catch {
        if (isMounted) {
          setIsPushEnabled(false);
        }
      }
    };
    void loadPushStatus();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleLogout = async () => {
    clearCookie("access_token");
    clearCookie("refresh_token");
    await router.push("/login");
  };

  const handleTogglePush = async (event: ChangeEvent<HTMLInputElement>) => {
    const nextEnabled = event.target.checked;
    setIsUpdatingPush(true);
    setPushStatus(null);
    try {
      if (nextEnabled) {
        await subscribeToPushNotifications();
        setIsPushEnabled(true);
        setPushStatus("Push notifications enabled");
      } else {
        await unsubscribeFromPushNotifications();
        setIsPushEnabled(false);
        setPushStatus("Push notifications disabled");
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update push notifications";
      setPushStatus(message);
      setIsPushEnabled(!nextEnabled);
    } finally {
      setIsUpdatingPush(false);
    }
  };

  return (
    <AppBar position="static" color="default" elevation={1}>
      <Toolbar sx={{ gap: 2 }}>
        <Typography
          variant="h6"
          component="div"
          sx={{ flexGrow: 1, fontWeight: 700 }}
        >
          Sun Stock Analysis
        </Typography>
        <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={isPushEnabled}
                onChange={handleTogglePush}
                disabled={isUpdatingPush}
              />
            }
            label={isUpdatingPush ? "Updating..." : "Push"}
            sx={{ mr: 0.5 }}
          />
          {navItems.map((item) => (
            <Button
              key={item.href}
              component={Link}
              href={item.href}
              color="inherit"
              sx={{ textTransform: "none" }}
            >
              {item.label}
            </Button>
          ))}
          <Button
            color="inherit"
            onClick={handleLogout}
            sx={{ textTransform: "none" }}
          >
            Logout
          </Button>
          {pushStatus ? (
            <Typography variant="caption" sx={{ color: "text.secondary", ml: 1 }}>
              {pushStatus}
            </Typography>
          ) : null}
        </Box>
      </Toolbar>
    </AppBar>
  );
}
