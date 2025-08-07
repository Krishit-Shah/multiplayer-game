import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import axios from 'axios';
import Chat from './Chat';

const Game = () => {
  const { roomId } = useParams();
  const { user } = useAuth();
  const { socket, joinRoom, leaveRoom, makeMove, restartGame } = useSocket();
  const navigate = useNavigate();
  
  const [room, setRoom] = useState(null);
  const [gameData, setGameData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isMoving, setIsMoving] = useState(false);

  const fetchRoom = useCallback(async () => {
    try {
      const response = await axios.get(`/api/rooms/${roomId}`);
      setRoom(response.data.room);
      setGameData(response.data.room.gameData);
    } catch (error) {
      setError('Failed to load game');
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    fetchRoom();
  }, [fetchRoom]);

  useEffect(() => {
    if (socket && room) {
      joinRoom(room.id);
      
      const handleRoomUpdated = ({ room: updatedRoom }) => {
        // Only log significant room updates, not every single one
        if (updatedRoom.gameState !== room?.gameState) {
          console.log('Game state changed:', updatedRoom.gameState);
        }
        setRoom(updatedRoom);
        setGameData(updatedRoom.gameData);
        
        // If game is reset to waiting, redirect back to room
        if (updatedRoom.gameState === 'waiting') {
          console.log('Game reset to waiting, redirecting to room');
          navigate(`/room/${roomId}`);
        }
      };

      const handleGameStarted = ({ gameType, gameData: newGameData }) => {
        console.log('Game started:', gameType);
        setGameData(newGameData);
      };

      const handleGameUpdated = ({ gameData: updatedGameData, gameState }) => {
        // Only log when game state changes or game ends
        if (gameState === 'finished' || gameState !== gameData?.gameState) {
          console.log('Game state updated:', gameState);
        }
        setGameData(updatedGameData);
        setIsMoving(false); // Reset moving state when game is updated
        if (gameState === 'finished') {
          // Game ended, stay in room for chat
        }
      };

      const handleGameReset = ({ gameState, gameData: resetGameData }) => {
        console.log('Game reset to:', gameState);
        setGameData(resetGameData);
        // Redirect back to room when game is reset
        navigate(`/room/${roomId}`);
      };

      const handleGameEnded = ({ finalScores }) => {
        console.log('Game ended with final scores');
        // Game completely finished
        setGameData(prev => ({ ...prev, gameState: 'finished' }));
      };

      socket.on('room-updated', handleRoomUpdated);
      socket.on('game-started', handleGameStarted);
      socket.on('game-updated', handleGameUpdated);
      socket.on('game-reset', handleGameReset);
      socket.on('game-ended', handleGameEnded);

      return () => {
        socket.off('room-updated', handleRoomUpdated);
        socket.off('game-started', handleGameStarted);
        socket.off('game-updated', handleGameUpdated);
        socket.off('game-reset', handleGameReset);
        socket.off('game-ended', handleGameEnded);
      };
    }
  }, [socket, room, roomId, navigate, joinRoom]);

  useEffect(() => {
    // Cleanup timer on unmount
    return () => {
      // No timers to clear for Tic Tac Toe
    };
  }, []);

  const handleLeaveGame = async () => {
    try {
      await axios.post('/api/rooms/leave');
      leaveRoom(roomId);
      navigate('/dashboard');
    } catch (error) {
      setError('Failed to leave game');
    }
  };

  const handleTicTacToeMove = (row, col) => {
    console.log('Move attempt:', {
      gameData: !!gameData,
      currentTurn: gameData?.currentTurn,
      userId: user.id,
      isMyTurn: gameData?.currentTurn === user.id,
      cellEmpty: !gameData?.board[row][col],
      isMoving,
      canMove: gameData && gameData.currentTurn === user.id && !gameData.board[row][col] && !isMoving
    });
    
    if (gameData && gameData.currentTurn === user.id && !gameData.board[row][col] && !isMoving) {
      console.log('Making move:', row, col);
      
      // Set moving state to prevent double-clicks
      setIsMoving(true);
      
      // Determine player symbol based on active player index in room
      const activePlayers = room?.players?.filter(p => !p.isSpectator) || [];
      const playerIndex = activePlayers.findIndex(p => p.user.id === user.id);
      const symbol = playerIndex === 0 ? 'X' : 'O';
      
      // Optimistic UI update - immediately update the board
      const optimisticGameData = {
        ...gameData,
        board: gameData.board.map((r, i) => 
          i === row ? r.map((c, j) => j === col ? symbol : c) : r
        )
      };
      setGameData(optimisticGameData);
      
      // Send move to server
      makeMove(roomId, { row, col });
      
      // Reset moving state after a short delay
      setTimeout(() => {
        setIsMoving(false);
      }, 500);
    }
  };

  const handleRestartGame = () => {
    console.log('Restarting game');
    restartGame(roomId);
  };

  if (loading) {
    return <div className="loading">Loading game...</div>;
  }

  if (error) {
    return (
      <div className="card">
        <div className="alert alert-danger">{error}</div>
        <button className="btn" onClick={() => navigate('/dashboard')}>
          Back to Dashboard
        </button>
      </div>
    );
  }

  if (!room || !gameData) {
    return <div className="loading">Game not found</div>;
  }

  const renderTicTacToe = () => {
    if (!gameData.board) return null;

    const isMyTurn = gameData.currentTurn === user.id;
    const gameFinished = gameData.winner || gameData.board.every(row => row.every(cell => cell !== ''));
    
    // Debug logging for turn validation
    console.log('Turn Debug:', {
      currentTurn: gameData.currentTurn,
      userId: user.id,
      isMyTurn,
      gameData: gameData
    });

    return (
      <div className="card">
        <h3>Tic Tac Toe</h3>
        
        {gameFinished ? (
          <div style={{ textAlign: 'center', marginBottom: '20px' }}>
            {gameData.winner ? (
              <div className="alert alert-success">
                {gameData.winner === user.id ? 'You won! 🎉' : 'You lost! 😔'}
              </div>
            ) : (
              <div className="alert alert-info">It's a draw! 🤝</div>
            )}
          </div>
        ) : (
          <div style={{ textAlign: 'center', marginBottom: '20px' }}>
            {isMyTurn ? (
              <div className="alert alert-info">Your turn! Make your move</div>
            ) : (
              <div className="alert alert-warning">Waiting for opponent...</div>
            )}
          </div>
        )}

        <div className="game-board" style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(3, 1fr)', 
          gap: '4px', 
          maxWidth: '300px', 
          margin: '0 auto' 
        }}>
          {gameData.board.map((row, rowIndex) =>
            row.map((cell, colIndex) => (
              <div
                key={`${rowIndex}-${colIndex}`}
                className={`game-cell ${cell.toLowerCase()}`}
                onClick={() => !gameFinished && isMyTurn && !cell && !isMoving && handleTicTacToeMove(rowIndex, colIndex)}
                style={{ 
                  cursor: (!gameFinished && isMyTurn && !cell && !isMoving) ? 'pointer' : 'default',
                  border: '2px solid #333',
                  height: '80px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '32px',
                  fontWeight: 'bold',
                  backgroundColor: (!gameFinished && isMyTurn && !cell && !isMoving) ? '#f0f0f0' : 'white',
                  opacity: isMoving ? 0.7 : 1
                }}
              >
                {cell}
              </div>
            ))
          )}
        </div>

        {gameFinished && (
          <div style={{ textAlign: 'center', marginTop: '20px' }}>
            <button className="btn btn-primary" onClick={handleRestartGame}>
              Play Again
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2>{room.name} - Tic Tac Toe</h2>
        <button className="btn btn-secondary" onClick={handleLeaveGame}>
          Leave Game
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>
        {/* Game Area */}
        <div>
          {renderTicTacToe()}
        </div>

        {/* Chat */}
        <div>
          <h3>Chat</h3>
          <Chat roomId={roomId} />
        </div>
      </div>
    </div>
  );
};

export default Game; 