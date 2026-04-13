import ResourceManagerPage from "@/features/examples/resource-manager/resource-manager-page";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/examples/resource-manager")({
  component: ResourceManagerPage,
});
