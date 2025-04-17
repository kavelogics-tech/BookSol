const routeItems = routes.map((route) => {
  const match = useMatch(route.path);

  return route.routes ? (
    <SidebarSubmenu route={route} key={route.name} />
  ) : (
    <li className="relative px-6 py-3" key={route.name}>
      <NavLink
        exact
        to={route.path}
        className="inline-flex items-center w-full text-sm font-semibold transition-colors duration-150 hover:text-gray-800 dark:hover:text-gray-200"
        activeClassName="text-gray-800 dark:text-gray-100"
      >
        {match && (
          <span
            className="absolute inset-y-0 left-0 w-1 bg-purple-600 rounded-tr-lg rounded-br-lg"
          />
        )}
        
        
        <Icon className="w-5 h-5" aria-hidden="true" icon={route.icon} />
              <span className="ml-4">{route.name}</span>
        {/* Your NavLink content here */}
      </NavLink>
    </li>
  );
});






return (
  <div className="py-4 text-gray-500 dark:text-gray-400">
    <a className="ml-6 text-lg font-bold text-gray-800 dark:text-gray-200" href="#">
      Windmill
    </a>
    <ul className="mt-6">{routeItems}</ul>
  </div>
);
