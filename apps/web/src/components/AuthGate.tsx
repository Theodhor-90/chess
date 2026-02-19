import { useEffect, useRef } from "react";
import { useGetMeQuery } from "../store/apiSlice.js";
import { useAppDispatch } from "../store/index.js";
import { socketActions } from "../store/socketMiddleware.js";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const dispatch = useAppDispatch();
  const { data, isSuccess } = useGetMeQuery();
  const connectedRef = useRef(false);

  useEffect(() => {
    if (isSuccess && data && !connectedRef.current) {
      connectedRef.current = true;
      dispatch(socketActions.connect());
    }
  }, [isSuccess, data, dispatch]);

  return <>{children}</>;
}
