"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.useTheme = void 0;
exports.ThemeProvider = ThemeProvider;
/* eslint-disable react-refresh/only-export-components */
const React = __importStar(require("react"));
const COLOR_SCHEME_QUERY = "(prefers-color-scheme: dark)";
const THEME_VALUES = ["dark", "light", "system"];
const ThemeProviderContext = React.createContext(undefined);
function isTheme(value) {
    if (value === null) {
        return false;
    }
    return THEME_VALUES.includes(value);
}
function getSystemTheme() {
    if (window.matchMedia(COLOR_SCHEME_QUERY).matches) {
        return "dark";
    }
    return "light";
}
function disableTransitionsTemporarily() {
    const style = document.createElement("style");
    style.appendChild(document.createTextNode("*,*::before,*::after{-webkit-transition:none!important;transition:none!important}"));
    document.head.appendChild(style);
    return () => {
        window.getComputedStyle(document.body);
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                style.remove();
            });
        });
    };
}
function isEditableTarget(target) {
    if (!(target instanceof HTMLElement)) {
        return false;
    }
    if (target.isContentEditable) {
        return true;
    }
    const editableParent = target.closest("input, textarea, select, [contenteditable='true']");
    if (editableParent) {
        return true;
    }
    return false;
}
function ThemeProvider({ children, defaultTheme = "system", storageKey = "theme", disableTransitionOnChange = true, ...props }) {
    const [theme, setThemeState] = React.useState(() => {
        const storedTheme = localStorage.getItem(storageKey);
        if (isTheme(storedTheme)) {
            return storedTheme;
        }
        return defaultTheme;
    });
    const setTheme = React.useCallback((nextTheme) => {
        localStorage.setItem(storageKey, nextTheme);
        setThemeState(nextTheme);
    }, [storageKey]);
    const applyTheme = React.useCallback((nextTheme) => {
        const root = document.documentElement;
        const resolvedTheme = nextTheme === "system" ? getSystemTheme() : nextTheme;
        const restoreTransitions = disableTransitionOnChange
            ? disableTransitionsTemporarily()
            : null;
        root.classList.remove("light", "dark");
        root.classList.add(resolvedTheme);
        if (restoreTransitions) {
            restoreTransitions();
        }
    }, [disableTransitionOnChange]);
    React.useEffect(() => {
        applyTheme(theme);
        if (theme !== "system") {
            return undefined;
        }
        const mediaQuery = window.matchMedia(COLOR_SCHEME_QUERY);
        const handleChange = () => {
            applyTheme("system");
        };
        mediaQuery.addEventListener("change", handleChange);
        return () => {
            mediaQuery.removeEventListener("change", handleChange);
        };
    }, [theme, applyTheme]);
    React.useEffect(() => {
        const handleKeyDown = (event) => {
            if (event.repeat) {
                return;
            }
            if (event.metaKey || event.ctrlKey || event.altKey) {
                return;
            }
            if (isEditableTarget(event.target)) {
                return;
            }
            if (event.key.toLowerCase() !== "d") {
                return;
            }
            setThemeState((currentTheme) => {
                const nextTheme = currentTheme === "dark"
                    ? "light"
                    : currentTheme === "light"
                        ? "dark"
                        : getSystemTheme() === "dark"
                            ? "light"
                            : "dark";
                localStorage.setItem(storageKey, nextTheme);
                return nextTheme;
            });
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [storageKey]);
    React.useEffect(() => {
        const handleStorageChange = (event) => {
            if (event.storageArea !== localStorage) {
                return;
            }
            if (event.key !== storageKey) {
                return;
            }
            if (isTheme(event.newValue)) {
                setThemeState(event.newValue);
                return;
            }
            setThemeState(defaultTheme);
        };
        window.addEventListener("storage", handleStorageChange);
        return () => {
            window.removeEventListener("storage", handleStorageChange);
        };
    }, [defaultTheme, storageKey]);
    const value = React.useMemo(() => ({
        theme,
        setTheme,
    }), [theme, setTheme]);
    return (<ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>);
}
const useTheme = () => {
    const context = React.useContext(ThemeProviderContext);
    if (context === undefined) {
        throw new Error("useTheme must be used within a ThemeProvider");
    }
    return context;
};
exports.useTheme = useTheme;
