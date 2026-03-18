import { useEffect, useRef } from "react";
import { useLocation } from "react-router";

function useRouteChangeFocus() {
  const location = useLocation();
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    const mainElement = document.getElementById("main-content");
    if (mainElement) {
      mainElement.focus();
    }
  }, [location.pathname]);
}

export { useRouteChangeFocus };
