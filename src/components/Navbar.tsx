import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import MenuIcon from "@mui/icons-material/Menu";
import NotificationsNoneIcon from "@mui/icons-material/NotificationsNone";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import { clearCookie } from "@/lib/api";
import { useEffect, useState, type ChangeEvent, type MouseEvent } from "react";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import {
  hasPushSubscription,
  resubscribeToPushNotifications,
  unsubscribeFromPushNotifications,
} from "@/lib/push";

type NavItem = {
  label: string;
  href: string;
};

const navItems: NavItem[] = [{ label: "Home", href: "/" }];

export default function Navbar() {
  const router = useRouter();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [isUpdatingPush, setIsUpdatingPush] = useState(false);
  const [isPushEnabled, setIsPushEnabled] = useState(false);
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);
  const isMenuOpen = Boolean(menuAnchorEl);

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
    try {
      if (nextEnabled) {
        await resubscribeToPushNotifications();
        setIsPushEnabled(true);
        alert("Push notifications enabled");
      } else {
        await unsubscribeFromPushNotifications();
        setIsPushEnabled(false);
        alert("Push notifications disabled");
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update push notifications";
      alert(message);
      setIsPushEnabled(!nextEnabled);
    } finally {
      setIsUpdatingPush(false);
    }
  };

  const handleOpenMenu = (event: MouseEvent<HTMLElement>) => {
    setMenuAnchorEl(event.currentTarget);
  };

  const handleCloseMenu = () => {
    setMenuAnchorEl(null);
  };

  const handleNavigate = async (href: string) => {
    handleCloseMenu();
    await router.push(href);
  };

  const handleLogoutFromMenu = async () => {
    handleCloseMenu();
    await handleLogout();
  };

  return (
    <AppBar position="static" color="default" elevation={1}>
      <Toolbar sx={{ gap: 2 }}>
        <Box sx={{ flexGrow: 1, display: "flex", alignItems: "center", gap: 2 }}>
          <Typography
            variant="h6"
            component="div"
            sx={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 1 }}
          >
            <Image src="/icons/icon.png" alt="Sun Stock Analysis icon" width={20} height={20} />
            Sun Stock Analysis
          </Typography>
          {!isMobile
            ? navItems.map((item) => (
                <Button
                  key={item.href}
                  component={Link}
                  href={item.href}
                  color="inherit"
                  sx={{ textTransform: "none" }}
                >
                  {item.label}
                </Button>
              ))
            : null}
        </Box>
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
            label={isUpdatingPush ? "Updating..." : <NotificationsNoneIcon fontSize="small" />}
            sx={{ mr: 0.5 }}
          />
          {isMobile ? (
            <>
              <IconButton
                color="inherit"
                aria-label="open menu"
                aria-controls={isMenuOpen ? "navbar-menu" : undefined}
                aria-haspopup="true"
                aria-expanded={isMenuOpen ? "true" : undefined}
                onClick={handleOpenMenu}
                edge="end"
              >
                <MenuIcon />
              </IconButton>
              <Menu
                id="navbar-menu"
                anchorEl={menuAnchorEl}
                open={isMenuOpen}
                onClose={handleCloseMenu}
              >
                {navItems.map((item) => (
                  <MenuItem key={item.href} onClick={() => void handleNavigate(item.href)}>
                    {item.label}
                  </MenuItem>
                ))}
                <MenuItem onClick={() => void handleLogoutFromMenu()}>Logout</MenuItem>
              </Menu>
            </>
          ) : (
            <Button
              color="inherit"
              onClick={handleLogout}
              sx={{ textTransform: "none" }}
            >
              Logout
            </Button>
          )}
        </Box>
      </Toolbar>
    </AppBar>
  );
}
