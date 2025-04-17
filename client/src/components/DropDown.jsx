import React, { useState, useRef, useEffect } from 'react';
import { Dropdown, DropdownItem, Button } from '@windmill/react-ui';
import { MoreVertical, MessageSquare, Eye, Trash2 } from 'lucide-react';

const FileActionsDropdown = ({ fileId, handleChatNavigation, onDelete }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const toggleDropdown = () => setIsOpen(!isOpen);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative inline-block" ref={dropdownRef}>
      <Button
        layout="outline"
        size="small"
        icon={MoreVertical}
        aria-label="File actions"
        onClick={toggleDropdown}
        className="w-8 h-8 p-0  text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
      />
      
      <Dropdown
        isOpen={isOpen}
        align="right"
        className="w-48 py-1 mt-1 z-50 shadow-lg rounded-md bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700"
      >
        <DropdownItem 
          onClick={() => handleChatNavigation(fileId)}
          className="flex items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          <MessageSquare className="w-4 h-4 mr-3 text-blue-500" />
          <span>Chat</span>
        </DropdownItem>
        
        <DropdownItem 
          onClick={() => {/* Add view functionality */}}
          className="flex items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          <Eye className="w-4 h-4 mr-3 text-purple-500" />
          <span>View</span>
        </DropdownItem>
        
        <DropdownItem 
          onClick={() => onDelete(fileId)}
          className="flex items-center px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          <Trash2 className="w-4 h-4 mr-3" />
          <span>Delete</span>
        </DropdownItem>
      </Dropdown>
    </div>
  );
};

export default FileActionsDropdown