import { Link } from "@tanstack/react-router";

const HomePage = () => {
  return (
    <div className="flex flex-col justify-center items-center p-4">
      <Link
        to="/examples/resource-manager"
        className="text-blue-400 hover:underline"
      >
        Resource Manager
      </Link>
    </div>
  );
};

export default HomePage;
