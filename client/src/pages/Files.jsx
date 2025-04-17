import React, { useState, useContext, useEffect, useCallback } from "react";
import { useDropzone } from "react-dropzone";

import { SearchContext } from "../context/SearchContext";

import response from "../utils/demo/tableData";
import axios from "axios";
import { HeartIcon, EditIcon, TrashIcon, fileIcon, ModalsIcon } from "../icons";
import { FaSpinner, FaCircleNotch } from "react-icons/fa";
//import { Dropdown, DropdownItem } from '@windmill/react-ui'

import Dropdown from "../components/DropDown";

import {
  TableBody,
  TableContainer,
  Table,
  TableHeader,
  TableCell,
  TableRow,
  TableFooter,
  Avatar,
  Badge,
  Pagination,
  Button,
} from "@windmill/react-ui";
import { useNavigate, useParams } from "react-router-dom";
import FileActionsDropdown from "../components/DropDown";

function Files() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [allFiles, setAllFiles] = useState([]);

  const { searchTerm } = useContext(SearchContext);
  const [filteredFiles, setFilteredFiles] = useState([]);

  // get folderId from url
  const { folderId } = useParams();
  const navigate = useNavigate();
  // pagination setup
  const resultsPerPage = 10;
  const totalResults = response.length;

  // pagination change control
  function onPageChange(p) {
    setPage(p);
  }

  const handleFileLoading = async () => {
    try {
      console.log("send request");
      const res = await axios.get(`/api/folder/getFiles/${folderId}`, {
        withCredentials: true,
      });

      console.log(res);

      setAllFiles(res.data.payload);
    } catch (error) {
      console.log(error);
    }
  };

  // navigate to chat module for particular file
  const handleChatNavigation = (fileId) => {
    navigate(`/app/chat/${fileId}`, { replace: true });
  };

  // on page change, load new sliced data
  // here you would make another server request for new data
  useEffect(() => {
    setData(response.slice((page - 1) * resultsPerPage, page * resultsPerPage));
    console.log("Loading files triggered");
    handleFileLoading();
  }, [page]);

  useEffect(() => {
    if (searchTerm) {
      const newFilteredFiles = allFiles.filter(
        (file) =>
          file.fileName &&
          file.fileName.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredFiles(newFilteredFiles);
    } else {
      setFilteredFiles(allFiles);
    }
  }, [searchTerm, allFiles]);

  // Rest of your component
  // Replace allFiles with filteredFiles in your rendering code

  const renderFileTypeBadge = (fileType) => {
    const fileTypeLowerCase = fileType.toLowerCase(); // Convert to lowercase

    if (fileTypeLowerCase === "pdf") {
      return <Badge type="danger">PDF</Badge>;
    } else if (fileTypeLowerCase === "docs") {
      return <Badge type="primary">Docs</Badge>;
    } else {
      return <Badge>{fileType}</Badge>; // Default badge for other file types
    }
  };

  // code for uploading files
  const onDrop = useCallback((acceptedFiles) => {
    acceptedFiles.forEach((file) => {
      setIsUploading(true);

      const formData = new FormData();
      formData.append("file", file);
      formData.append("folderId", folderId);

      axios
        .post("/api/file/upload", formData, {
          "Content-Type": "multipart/form-data",
          withCredentials: true,
        })
        .then((response) => {
          console.log(response);
          setAllFiles((previousFiles) => [
            ...previousFiles,
            response.data.payload[0],
          ]);
          setIsUploading(false);
        })
        .catch((error) => {
          console.error(error);
          setIsUploading(false);
        });
    });
  }, []);
  const { getRootProps, getInputProps } = useDropzone({ onDrop });

  const onDelete = async (fileId) => {
    try {
      const res = await axios.delete(`/api/file/delete/${fileId}`, {
        withCredentials: true,
      });

      console.log(res);
      setAllFiles(allFiles.filter((file) => file._id !== fileId));
    } catch (error) {
      console.log(error);
    }
  };

  return (
    <>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <i class="fa-solid fa-upload"></i>
        <div {...getRootProps()}>
          <input {...getInputProps()} />
          {/* <i class="fa-solid fa-upload">Files</i> */}
          {isUploading ? (
            <Button className="mt-3 mb-3" iconLeft={FaCircleNotch}>
              Uploading file...
            </Button>
          ) : (
            <Button className=" mt-3 mb-3" iconLeft={fileIcon}>
              Upload File
            </Button>
          )}
        </div>
      </div>

      {/* <TableContainer className="rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        <Table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <TableHeader className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <TableCell className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Title
              </TableCell>
              <TableCell className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Type
              </TableCell>
              <TableCell className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Date
              </TableCell>
              <TableCell className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Actions
              </TableCell>
            </tr>
          </TableHeader>
          <TableBody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {filteredFiles.map((file, i) => (
              <TableRow
                key={i}
                className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors duration-150"
              >
                <TableCell className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <Avatar
                      className="flex-shrink-0 h-10 w-10 rounded-lg bg-gray-100 dark:bg-gray-600 p-1.5 mr-4 border border-gray-200 dark:border-gray-600"
                      src={
                        "https://png.pngtree.com/png-vector/20190129/ourmid/pngtree-document-vector-icon-png-image_355823.jpg"
                      }
                      alt="Document icon"
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate max-w-xs">
                        {file.fileName}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        • Uploaded
                      </p>
                    </div>
                  </div>
                </TableCell>

                <TableCell className="px-6 py-4 whitespace-nowrap">
                  {renderFileTypeBadge(file.fileType)}
                </TableCell>

                <TableCell className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900 dark:text-gray-200">
                    {new Date(file.createdAt).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {new Date(file.createdAt).toLocaleTimeString("en-US", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </TableCell>

                <TableCell className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <div className="flex justify-end space-x-2">
                    <Dropdown
                      fileId={file._id}
                      handleChatNavigation={handleChatNavigation}
                      onDelete={onDelete}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <TableFooter className="bg-gray-50 dark:bg-gray-800 px-6 py-3">
          <Pagination
            totalResults={totalResults}
            resultsPerPage={resultsPerPage}
            label="Table navigation"
            onChange={onPageChange}
            className="border-t border-gray-200 dark:border-gray-700"
          />
        </TableFooter>
      </TableContainer> */}

<TableContainer className="rounded-xl border border-gray-100 dark:border-gray-700 shadow-xs overflow-hidden bg-white dark:bg-gray-800">
  <Table className="min-w-full">
    <TableHeader className="bg-gray-50 dark:bg-gray-700/50">
      <tr>
        <TableCell className="px-6 py-4 text-left text-sm font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider align-top">
          Document
        </TableCell>
        <TableCell className="px-6 py-4 text-left text-sm font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider align-top">
          Type
        </TableCell>
        <TableCell className="px-6 py-4 text-left text-sm font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider align-top">
          Last Modified
        </TableCell>
        <TableCell className="px-6 py-4 text-right text-sm font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider align-top">
          Actions
        </TableCell>
      </tr>
    </TableHeader>
    <TableBody className="divide-y divide-gray-100 dark:divide-gray-700 h-[50vh]">
      {filteredFiles.map((file, i) => (
        <TableRow
          key={i}
          className="hover:bg-gray-50/50 dark:hover:bg-gray-700/30 transition-colors duration-200"
        >
          <TableCell className="px-6 py-4 align-top">
            <div className="flex items-start space-x-4"> {/* Changed items-center to items-start */}
              <div className="flex-shrink-0 p-2 rounded-lg bg-blue-50 dark:bg-blue-900/30">
                <img
                  className="h-8 w-8"
                  src="https://cdn-icons-png.flaticon.com/512/136/136528.png"
                  alt="Document"
                />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {file.fileName}
                </p>
                <p className="lg:text-xs text-[9px] text-gray-500 dark:text-gray-400 mt-1">
                 <span className="text-green-500 font-semibold">Uploaded</span>  • {new Date(file.createdAt).toLocaleDateString()}
                </p>
              </div>
            </div>
          </TableCell>

          <TableCell className="px-6 py-4 align-top">
            <div className="flex items-start"> {/* Changed items-center to items-start */}
              {renderFileTypeBadge(file.fileType)}
            </div>
          </TableCell>

          <TableCell className="px-6 py-4 align-top">
            <div className="text-sm text-gray-700 dark:text-gray-300">
              {new Date(file.createdAt).toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </div>
          </TableCell>

          <TableCell className="px-6 py-4 text-right align-top">
            <div className="flex justify-end">
              <FileActionsDropdown
                fileId={file._id}
                handleChatNavigation={handleChatNavigation}
                onDelete={onDelete}
              />
            </div>
          </TableCell>
        </TableRow>
      ))}
    </TableBody>
  </Table>
  <TableFooter className="bg-white dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700">
    <Pagination
      totalResults={totalResults}
      resultsPerPage={resultsPerPage}
      label="Table navigation"
      onChange={onPageChange}
      className="px-6 py-3"
    />
  </TableFooter>
</TableContainer>

      <div></div>
    </>
  );
}

export default Files;
